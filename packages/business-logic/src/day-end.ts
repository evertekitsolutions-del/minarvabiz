/**
 * Day-end governance — snapshot daily totals, lock the business day and keep
 * an auditable reopen history.
 */

import { generateId, nowISO } from "@minarvabiz/utils";
import { collectLiveDashboardMetrics } from "./live-dashboard";
import { dayEndReport } from "./phase7-store";
import type { DayEndReport } from "./reports";
import { touchPersistence } from "./autosave";
import { auditAction } from "./audit-actions";
import { assertPermission, getCurrentRole } from "./permissions";
import { hydrateBusinessDayLocks, localBusinessDate, lockBusinessDay, unlockBusinessDay } from "./business-day-state";
export { assertBusinessDayOpen, isBusinessDayClosed } from "./business-day-state";

export interface DayEndCloseRecord {
  id: string;
  businessDate: string;
  closedAt: string;
  closedByRole?: string | null;
  reopenedAt?: string | null;
  reopenedByRole?: string | null;
  reopenReason?: string | null;
  report: DayEndReport;
  metricsNote: string;
}

const closes: DayEndCloseRecord[] = [];

function validBusinessDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function listDayEndCloses(): DayEndCloseRecord[] {
  return [...closes].sort((a, b) => b.closedAt.localeCompare(a.closedAt));
}

export function getDayEndClose(businessDate: string): DayEndCloseRecord | undefined {
  return closes.find((c) => c.businessDate === businessDate && !c.reopenedAt);
}

export function isBusinessDayClosed(businessDate = localBusinessDate()): boolean {
  return Boolean(getDayEndClose(businessDate));
}

export function assertBusinessDayOpen(businessDate = localBusinessDate()): void {
  if (isBusinessDayClosed(businessDate)) {
    throw new Error(`Business day ${businessDate} is closed. Reopen the day before posting financial changes.`);
  }
}

export function closeBusinessDay(businessDate?: string): {
  record: DayEndCloseRecord | null;
  error?: string;
} {
  try {
    assertPermission("dayend.close");
  } catch (error) {
    return { record: null, error: error instanceof Error ? error.message : "Permission denied" };
  }

  const today = localBusinessDate();
  const date = businessDate || today;
  if (!validBusinessDate(date)) return { record: null, error: "Invalid business date" };
  if (date !== today) {
    return { record: null, error: "Day-end close currently supports today only" };
  }
  if (getDayEndClose(date)) {
    return { record: null, error: `Day ${date} already closed` };
  }

  const report = dayEndReport();
  const metrics = collectLiveDashboardMetrics();
  const role = getCurrentRole();
  const record: DayEndCloseRecord = {
    id: generateId(),
    businessDate: date,
    closedAt: nowISO(),
    closedByRole: role,
    reopenedAt: null,
    reopenedByRole: null,
    reopenReason: null,
    report,
    metricsNote: `Sales ${metrics.productSalesToday} · Services ${metrics.serviceRevenueToday} · Laundry ${metrics.laundryRevenueToday}`,
  };
  closes.unshift(record);
  lockBusinessDay(date);
  auditAction("day_end.close", "day_end_closes", record.id, null, {
    businessDate: date,
    closedAt: record.closedAt,
    closedByRole: role,
    report,
  });
  try {
    void import("./phase6-store").then((m) => {
      m.pushNotification({
        kind: "system",
        title: "Day-end closed",
        body: `Business day ${date} closed and locked. Net profit snapshot recorded.`,
        href: "/day-end",
      });
    });
  } catch {
    /* ignore */
  }
  touchPersistence();
  return { record };
}

export function reopenBusinessDay(
  businessDate: string,
  reason: string
): { record: DayEndCloseRecord | null; error?: string } {
  try {
    assertPermission("dayend.reopen");
  } catch (error) {
    return { record: null, error: error instanceof Error ? error.message : "Permission denied" };
  }

  if (!validBusinessDate(businessDate)) return { record: null, error: "Invalid business date" };
  const reopenReason = reason.trim();
  if (reopenReason.length < 3) return { record: null, error: "Reopen reason is required" };

  const record = getDayEndClose(businessDate);
  if (!record) return { record: null, error: `Day ${businessDate} is not closed` };

  const before = { ...record };
  record.reopenedAt = nowISO();
  record.reopenedByRole = getCurrentRole();
  record.reopenReason = reopenReason;
  unlockBusinessDay(businessDate);

  auditAction("day_end.reopen", "day_end_closes", record.id, before, {
    ...record,
    report: undefined,
  });
  try {
    void import("./phase6-store").then((m) => {
      m.pushNotification({
        kind: "system",
        title: "Day-end reopened",
        body: `Business day ${businessDate} reopened: ${reopenReason}`,
        href: "/day-end",
      });
    });
  } catch {
    /* ignore */
  }
  touchPersistence();
  return { record };
}

export function hydrateDayEnd(data: { closes?: DayEndCloseRecord[] }) {
  if (data.closes) {
    closes.length = 0;
    closes.push(...data.closes);
    hydrateBusinessDayLocks(closes.filter((record) => !record.reopenedAt).map((record) => record.businessDate));
  }
}
