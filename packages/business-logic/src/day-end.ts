/**
 * Day-end close — snapshot daily totals and mark the day closed.
 */

import { generateId, nowISO } from "@minarvabiz/utils";
import { collectLiveDashboardMetrics } from "./live-dashboard";
import { dayEndReport } from "./phase7-store";
import type { DayEndReport } from "./reports";
import { touchPersistence } from "./autosave";

export interface DayEndCloseRecord {
  id: string;
  businessDate: string;
  closedAt: string;
  report: DayEndReport;
  metricsNote: string;
}

const closes: DayEndCloseRecord[] = [];

export function listDayEndCloses(): DayEndCloseRecord[] {
  return [...closes].sort((a, b) => b.closedAt.localeCompare(a.closedAt));
}

export function getDayEndClose(businessDate: string): DayEndCloseRecord | undefined {
  return closes.find((c) => c.businessDate === businessDate);
}

export function closeBusinessDay(businessDate?: string): {
  record: DayEndCloseRecord | null;
  error?: string;
} {
  const date = businessDate || new Date().toISOString().slice(0, 10);
  if (getDayEndClose(date)) {
    return { record: null, error: `Day ${date} already closed` };
  }
  const report = dayEndReport();
  const metrics = collectLiveDashboardMetrics();
  const record: DayEndCloseRecord = {
    id: generateId(),
    businessDate: date,
    closedAt: nowISO(),
    report,
    metricsNote: `Sales ${metrics.productSalesToday} · Services ${metrics.serviceRevenueToday} · Laundry ${metrics.laundryRevenueToday}`,
  };
  closes.unshift(record);
  try {
    // Avoid hard circular import at typecheck by dynamic push notification
    void import("./phase6-store").then((m) => {
      m.pushNotification({
        kind: "system",
        title: "Day-end closed",
        body: `Business day ${date} closed. Net profit snapshot recorded.`,
        href: "/reports",
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
  }
}
