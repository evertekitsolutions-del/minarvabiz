/**
 * SVC-010 — provider-neutral AMC maintenance visit planner.
 *
 * Original Minarva implementation of standard recurring service visit
 * scheduling. A plan is a read-only proposal, NOT a signed contract,
 * appointment or a dispatched service job. Never mutates customer data.
 */

export interface AmcVisitPlanInput {
  readonly customerId: string;
  readonly customerName: string;
  readonly contractReference: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly intervalMonths: 1 | 2 | 3 | 6 | 12;
  readonly notes?: string;
}
export interface AmcPlannedVisit {
  readonly sequence: number;
  /** Local-business calendar date, not a timezone-dependent timestamp. */
  readonly visitDate: string;
}
export interface AmcVisitPlan {
  readonly customerId: string;
  readonly customerName: string;
  readonly contractReference: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly intervalMonths: AmcVisitPlanInput["intervalMonths"];
  readonly visits: readonly AmcPlannedVisit[];
  readonly csv: string;
}
const INTERVALS = new Set<number>([1, 2, 3, 6, 12]);
const MAX_VISITS = 61;
const MAX_MONTHS = 60;

function civilDate(value: string): { year: number; month: number; day: number } {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("AMC dates must use YYYY-MM-DD between 2000 and 2099");
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month ||
      date.getUTCDate() !== day) throw new Error("Invalid AMC calendar date");
  return { year, month, day };
}

function nextVisit(start: ReturnType<typeof civilDate>, months: number): string {
  // Always anchor to the original contract day to prevent Feb 28 drift:
  // January 31 -> February 28 -> March 31.
  const first = new Date(Date.UTC(start.year, start.month - 1 + months, 1));
  const year = first.getUTCFullYear(), month = first.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(year, month, Math.min(start.day, lastDay)));
  return d.toISOString().slice(0, 10);
}

function csvCell(value: string | number): string {
  const raw = String(value);
  const safe = /^\s*[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}

/** Deterministic, bounded monthly visit proposals with no host time dependency. */
export function planAmcVisits(input: AmcVisitPlanInput): AmcVisitPlan {
  const customerId = input.customerId.trim();
  const customerName = input.customerName.trim();
  const contractReference = input.contractReference.trim();
  if (!customerId || !customerName || !contractReference) {
    throw new Error("AMC customer and contract reference are required");
  }
  if (customerId.length > 128 || customerName.length > 256 || contractReference.length > 128 ||
      (input.notes ?? "").length > 2000) throw new Error("AMC fields exceed maximum length");
  if (!INTERVALS.has(input.intervalMonths)) throw new Error("Invalid AMC visit interval");
  const start = civilDate(input.startDate), end = civilDate(input.endDate);
  if (input.startDate > input.endDate) throw new Error("AMC end date precedes start date");
  const calendarMonths = (end.year - start.year) * 12 + end.month - start.month;
  if (calendarMonths > MAX_MONTHS ||
      (calendarMonths === MAX_MONTHS && end.day > start.day)) {
    throw new Error("AMC planner supports contracts up to five years");
  }
  const visits: AmcPlannedVisit[] = [];
  for (let i = 0; i < MAX_VISITS; i++) {
    const visitDate = nextVisit(start, i * input.intervalMonths);
    if (visitDate > input.endDate) break;
    visits.push({ sequence: i + 1, visitDate });
  }
  if (!visits.length) throw new Error("AMC planner produced no visits");
  const lines = [
    ["Contract reference", "Customer ID", "Customer", "Visit number",
      "Visit date (YYYY-MM-DD)", "Interval months", "Service notes"],
    ...visits.map(v => [
      contractReference, customerId, customerName, String(v.sequence),
      v.visitDate, String(input.intervalMonths), input.notes ?? "",
    ]),
  ];
  return {
    customerId, customerName, contractReference,
    startDate: input.startDate, endDate: input.endDate,
    intervalMonths: input.intervalMonths,
    visits,
    csv: lines.map(line => line.map(csvCell).join(",")).join("\r\n") + "\r\n",
  };
}
