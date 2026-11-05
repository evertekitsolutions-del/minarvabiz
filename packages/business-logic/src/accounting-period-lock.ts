/** FIN-023: industry-neutral period-close decision contract. No persistence or authority is granted here. */
export type AccountingPeriodLock = Readonly<{
  id: string; tenantId: string; companyId: string; branchId: string | null;
  startsOn: string; endsBefore: string; revision: number; status: "open" | "closed";
}>;
export type PeriodPostingRequest = Readonly<{
  tenantId: string; companyId: string; branchId: string;
  postingDate: string; expectedRevision: number;
}>;
const day = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};
const id = (value: string): boolean => typeof value === "string" && value.trim().length > 0 && value === value.trim();
export type PeriodPostingDecision =
  | Readonly<{ allowed: true; matchedPeriodId: string; revision: number }>
  | Readonly<{ allowed: false; reason: "invalid_scope" | "invalid_date" | "invalid_periods" | "uncovered_date" | "closed_period" | "stale_revision" }>;
/** Requires a trusted complete period snapshot; the host must authorize, lock and persist atomically. */
export function decideAccountingPeriodPosting(
  request: PeriodPostingRequest, periods: readonly AccountingPeriodLock[],
): PeriodPostingDecision {
  if (![request.tenantId, request.companyId, request.branchId].every(id)) return { allowed: false, reason: "invalid_scope" };
  if (!day(request.postingDate)) return { allowed: false, reason: "invalid_date" };
  if (!Array.isArray(periods) || periods.length === 0) return { allowed: false, reason: "uncovered_date" };
  const seen = new Set<string>();
  for (const p of periods) {
    if (!p || ![p.id, p.tenantId, p.companyId].every(id) || (p.branchId !== null && !id(p.branchId)) ||
      p.tenantId !== request.tenantId || p.companyId !== request.companyId ||
      (p.branchId !== null && p.branchId !== request.branchId) ||
      !day(p.startsOn) || !day(p.endsBefore) || p.startsOn >= p.endsBefore ||
      !Number.isSafeInteger(p.revision) || p.revision < 0 ||
      (p.status !== "open" && p.status !== "closed") || seen.has(p.id)) {
      return { allowed: false, reason: "invalid_periods" };
    }
    seen.add(p.id);
  }
  const matches = periods.filter(p => p.startsOn <= request.postingDate && request.postingDate < p.endsBefore);
  // Overlapping company-wide and branch-specific periods are ambiguous; never silently prefer one.
  if (matches.length > 1) return { allowed: false, reason: "invalid_periods" };
  if (!matches.length) return { allowed: false, reason: "uncovered_date" };
  const period = matches[0]!;
  if (period.status === "closed") return { allowed: false, reason: "closed_period" };
  if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision !== period.revision)
    return { allowed: false, reason: "stale_revision" };
  return { allowed: true, matchedPeriodId: period.id, revision: period.revision };
}
