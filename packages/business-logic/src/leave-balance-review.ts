/**
 * HR-006: permission-gated, read-only leave balance and request review.
 * Original implementation. No statutory leave policy is assumed.
 * Caller must provide authorized, tenant-scoped persisted records.
 * All units are integer minutes of configured leave entitlement; no floating
 * point rounding, calendar-day inference, payroll posting or mutations here.
 */
export interface LeaveScope {
  tenantId: string;
  companyId: string;
  branchId: string;
  employeeId: string;
  canViewLeave: boolean;
}
export interface LeaveGrant {
  id: string;
  tenantId: string;
  companyId: string;
  branchId: string;
  employeeId: string;
  leaveTypeId: string;
  minutes: number;
  effectiveDate: string;
  version: number;
}
export interface LeaveRequest {
  id: string;
  tenantId: string;
  companyId: string;
  branchId: string;
  employeeId: string;
  leaveTypeId: string;
  from: string;
  to: string;
  minutes: number;
  status: "draft" | "pending" | "approved" | "rejected" | "cancelled";
  version: number;
}
export interface LeaveBalance {
  leaveTypeId: string;
  grantedMinutes: number;
  approvedMinutes: number;
  pendingMinutes: number;
  availableMinutes: number;
  overdrawnMinutes: number;
}
const id = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 128 && v.trim() === v;
const minutes = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 0;
const version = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) > 0;
const day = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  if (y < 1900 || y > 9999) return false;
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d;
};
function assertScope(scope: LeaveScope): void {
  if (!scope || ![scope.tenantId, scope.companyId, scope.branchId, scope.employeeId].every(id) ||
    scope.canViewLeave !== true) throw Error("Authorized leave scope required");
}
function assertRecord(record: LeaveGrant | LeaveRequest, scope: LeaveScope): void {
  if (!record || !id(record.id) || !id(record.leaveTypeId) || !version(record.version) ||
    record.tenantId !== scope.tenantId || record.companyId !== scope.companyId ||
    record.branchId !== scope.branchId || record.employeeId !== scope.employeeId ||
    !minutes(record.minutes)) throw Error("Leave record invalid or outside authorized scope");
}
function add(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw Error("Leave minute total overflow");
  return sum;
}
/**
 * Reviews a bounded authorized snapshot. Requests crossing a reporting cutoff
 * are deliberately rejected rather than partially debited without a day policy.
 * Pending requests are disclosed separately and never automatically deducted.
 */
export function reviewLeaveBalances(input: {
  scope: LeaveScope;
  grants: readonly LeaveGrant[];
  requests: readonly LeaveRequest[];
  asOf: string;
}): LeaveBalance[] {
  if (!input) throw Error("Leave snapshot required");
  const { scope, grants, requests, asOf } = input;
  assertScope(scope);
  if (!day(asOf) || !Array.isArray(grants) || !Array.isArray(requests) ||
    grants.length > 10000 || requests.length > 10000)
    throw Error("Bounded leave snapshot and valid cutoff required");
  const seen = new Set<string>();
  const balances = new Map<string, LeaveBalance>();
  const get = (type: string): LeaveBalance => {
    let b = balances.get(type);
    if (!b) {
      b = { leaveTypeId: type, grantedMinutes: 0, approvedMinutes: 0,
        pendingMinutes: 0, availableMinutes: 0, overdrawnMinutes: 0 };
      balances.set(type, b);
    }
    return b;
  };
  for (const grant of grants) {
    assertRecord(grant, scope);
    if (!day(grant.effectiveDate)) throw Error("Invalid leave grant date");
    const key = "grant:" + grant.id;
    if (seen.has(key)) throw Error("Duplicate leave record");
    seen.add(key);
    if (grant.effectiveDate <= asOf) {
      const b = get(grant.leaveTypeId);
      b.grantedMinutes = add(b.grantedMinutes, grant.minutes);
    }
  }
  for (const request of requests) {
    assertRecord(request, scope);
    if (!day(request.from) || !day(request.to) || request.from > request.to ||
      !["draft", "pending", "approved", "rejected", "cancelled"].includes(request.status))
      throw Error("Invalid leave request dates or status");
    const key = "request:" + request.id;
    if (seen.has(key)) throw Error("Duplicate leave record");
    seen.add(key);
    if (request.from <= asOf && request.to > asOf &&
      (request.status === "approved" || request.status === "pending"))
      throw Error("Leave request spans cutoff; use configured day allocation");
    if (request.to > asOf) continue;
    const b = get(request.leaveTypeId);
    if (request.status === "approved") b.approvedMinutes = add(b.approvedMinutes, request.minutes);
    if (request.status === "pending") b.pendingMinutes = add(b.pendingMinutes, request.minutes);
  }
  return [...balances.values()].map(b => {
    const net = b.grantedMinutes - b.approvedMinutes;
    return { ...b, availableMinutes: Math.max(0, net),
      overdrawnMinutes: Math.max(0, -net) };
  }).sort((a, b) => a.leaveTypeId.localeCompare(b.leaveTypeId));
}
