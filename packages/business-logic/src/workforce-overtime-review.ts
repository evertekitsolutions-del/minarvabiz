/**
 * HR-007: configurable overtime eligibility review, shared by all business types.
 * Read-only decision contract; neither payroll nor attendance records are posted.
 * Policy thresholds are explicit, not assumed from any country's labor law.
 * Source: original Minarva Biz TypeScript; no third-party code copied.
 */
export type OvertimeEntryStatus = "approved" | "pending" | "rejected" | "cancelled";
export interface OvertimeWorkEntry {
  readonly id: string;
  readonly orgId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly employeeId: string;
  readonly workDate: string; // branch-local YYYY-MM-DD
  readonly workedMinutes: number; // verified net minutes, no floating-point hours
  readonly status: OvertimeEntryStatus;
}
export interface OvertimeReviewInput {
  readonly orgId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly employeeId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly standardMinutesPerDay: number;
  readonly maximumOvertimeMinutesPerDay: number;
  readonly entries: readonly OvertimeWorkEntry[];
  readonly canViewWorkforce: boolean;
}
export interface OvertimeDayReview {
  readonly workDate: string;
  readonly approvedWorkedMinutes: number;
  readonly eligibleOvertimeMinutes: number;
  readonly pendingWorkedMinutes: number;
}
export interface OvertimeReview {
  readonly employeeId: string;
  readonly approvedOvertimeMinutes: number;
  readonly pendingEntryCount: number;
  readonly days: readonly OvertimeDayReview[];
}

function id(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128;
}
function civilDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid overtime calendar date");
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 9999) throw new Error("Invalid overtime calendar date");
  const ms = Date.UTC(year, month - 1, day);
  const date = new Date(ms);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error("Invalid overtime calendar date");
  }
  return ms;
}
function minutes(value: unknown, upper: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= upper;
}
/** Fail closed on mixed-scope rows, duplicates and unapproved time; deterministic and immutable. */
export function reviewEmployeeOvertime(input: OvertimeReviewInput): OvertimeReview {
  if (!input.canViewWorkforce) throw new Error("Workforce permission required");
  if (![input.orgId, input.companyId, input.branchId, input.employeeId].every(id)) {
    throw new Error("Invalid overtime scope");
  }
  const start = civilDay(input.periodStart);
  const end = civilDay(input.periodEnd);
  if (end < start || (end - start) / 86400000 > 366) throw new Error("Invalid overtime period");
  if (!minutes(input.standardMinutesPerDay, 1440) || input.standardMinutesPerDay < 1 ||
      !minutes(input.maximumOvertimeMinutesPerDay, 1440)) {
    throw new Error("Invalid overtime policy");
  }
  if (!Array.isArray(input.entries) || input.entries.length > 20000) throw new Error("Invalid overtime entries");
  const seen = new Set<string>();
  const totals = new Map<string, { approved: number; pending: number }>();
  let pendingEntryCount = 0;
  for (const entry of input.entries) {
    if (!entry || !id(entry.id) || seen.has(entry.id)) throw new Error("Duplicate or invalid overtime entry");
    seen.add(entry.id);
    if (entry.orgId !== input.orgId || entry.companyId !== input.companyId ||
        entry.branchId !== input.branchId || entry.employeeId !== input.employeeId) {
      throw new Error("Overtime scope mismatch");
    }
    const day = civilDay(entry.workDate);
    if (!minutes(entry.workedMinutes, 1440) ||
        !["approved", "pending", "rejected", "cancelled"].includes(entry.status)) {
      throw new Error("Invalid overtime entry");
    }
    if (day < start || day > end) continue;
    const current = totals.get(entry.workDate) ?? { approved: 0, pending: 0 };
    if (entry.status === "approved") current.approved += entry.workedMinutes;
    if (entry.status === "pending") {
      current.pending += entry.workedMinutes;
      pendingEntryCount++;
    }
    // More than 24h for the same employee on the same civil day requires
    // reconciliation, not silent capping of duplicate overlapping shifts.
    if (current.approved + current.pending > 1440) throw new Error("Overtime day exceeds 24 hours");
    totals.set(entry.workDate, current);
  }
  let approvedOvertimeMinutes = 0;
  const days = [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([workDate, value]) => {
    const raw = Math.max(0, value.approved - input.standardMinutesPerDay);
    const eligibleOvertimeMinutes = Math.min(raw, input.maximumOvertimeMinutesPerDay);
    approvedOvertimeMinutes += eligibleOvertimeMinutes;
    return Object.freeze({
      workDate, approvedWorkedMinutes: value.approved,
      eligibleOvertimeMinutes, pendingWorkedMinutes: value.pending
    });
  });
  return Object.freeze({
    employeeId: input.employeeId, approvedOvertimeMinutes, pendingEntryCount,
    days: Object.freeze(days)
  });
}
