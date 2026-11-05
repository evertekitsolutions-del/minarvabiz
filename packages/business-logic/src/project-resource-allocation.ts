/**
 * PRJ-005 — industry-neutral, tenant-scoped resource capacity reservation.
 * Original Minarva Biz implementation. No third-party source or dependencies.
 * Pure validation/planning only: host must atomically persist the returned record,
 * enforce authoritative RBAC and compare-and-swap against the resource revision.
 */
export type ResourceBookingStatus = "confirmed" | "cancelled";
export interface ProjectResourceBooking {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly projectId: string;
  readonly resourceId: string;
  readonly startAt: string;
  readonly endAt: string;
  /** Integer percentage 1..100, where 100 means exclusive allocation. */
  readonly capacityPercent: number;
  readonly status: ResourceBookingStatus;
}
export interface ResourceAllocationRequest {
  readonly booking: ProjectResourceBooking;
  readonly actorId: string;
  /** Must be computed by the authoritative host, never trusted from client payload. */
  readonly authorized: boolean;
  readonly expectedResourceRevision: number;
}
export interface ResourceAllocationPlan {
  readonly booking: ProjectResourceBooking;
  readonly expectedResourceRevision: number;
  readonly nextResourceRevision: number;
  readonly audit: {
    readonly actorId: string;
    readonly tenantId: string;
    readonly companyId: string;
    readonly branchId: string;
    readonly projectId: string;
    readonly resourceId: string;
    readonly bookingId: string;
    readonly action: "resource_booking_confirmed";
  };
}
const validId = (s: unknown): s is string =>
  typeof s === "string" && s.length > 0 && s.length <= 128 &&
  /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/.test(s);
const utcTime = (s: unknown): number => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s))
    throw new Error("Resource booking requires canonical UTC timestamps");
  const ms = Date.parse(s);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== s.slice(0, 19))
    throw new Error("Invalid resource booking timestamp");
  return ms;
};
const validateBooking = (b: ProjectResourceBooking): readonly [number, number] => {
  for (const id of [b.id, b.tenantId, b.companyId, b.branchId, b.projectId, b.resourceId]) {
    if (!validId(id)) throw new Error("Invalid resource booking identifier");
  }
  if (!Number.isSafeInteger(b.capacityPercent) || b.capacityPercent < 1 || b.capacityPercent > 100)
    throw new Error("Invalid resource capacity percentage");
  if (b.status !== "confirmed" && b.status !== "cancelled")
    throw new Error("Invalid resource booking status");
  const start = utcTime(b.startAt);
  const end = utcTime(b.endAt);
  if (start >= end) throw new Error("Resource booking requires positive duration");
  return [start, end];
};
/**
 * Plans a new confirmed booking. Caller supplies all authoritative, active bookings
 * for this resource and company/tenant; incomplete snapshots MUST NOT be used.
 * Branches within one company share resource capacity; other tenants/companies
 * must never be included in the caller's snapshot.
 * Windows are half-open [startAt, endAt), allowing back-to-back reservations.
 */
export function planProjectResourceAllocation(
  input: ResourceAllocationRequest,
  existing: readonly ProjectResourceBooking[],
  currentResourceRevision: number,
): ResourceAllocationPlan {
  const b = input.booking;
  if (!input.authorized || !validId(input.actorId))
    throw new Error("Resource booking requires authorized actor");
  if (!Number.isSafeInteger(currentResourceRevision) || currentResourceRevision < 0 ||
      !Number.isSafeInteger(input.expectedResourceRevision) ||
      input.expectedResourceRevision !== currentResourceRevision)
    throw new Error("Stale resource allocation revision");
  if (currentResourceRevision === Number.MAX_SAFE_INTEGER)
    throw new Error("Resource allocation revision overflow");
  const [start, end] = validateBooking(b);
  if (b.status !== "confirmed") throw new Error("Only confirmed allocations can be created");
  const events: Array<readonly [number, number]> = [[start, b.capacityPercent], [end, -b.capacityPercent]];
  const seen = new Set<string>();
  for (const row of existing) {
    const [s, e] = validateBooking(row);
    if (row.tenantId !== b.tenantId || row.companyId !== b.companyId ||
        row.resourceId !== b.resourceId)
      throw new Error("Resource allocation snapshot has invalid scope");
    if (seen.has(row.id) || row.id === b.id)
      throw new Error("Duplicate resource booking identifier");
    seen.add(row.id);
    if (row.status === "cancelled" || e <= start || s >= end) continue;
    events.push([Math.max(s, start), row.capacityPercent], [Math.min(e, end), -row.capacityPercent]);
  }
  // End events precede start events at equal timestamps (half-open windows).
  events.sort((a, c) => a[0] - c[0] || a[1] - c[1]);
  let active = 0;
  for (const [, delta] of events) {
    active += delta;
    if (active > 100) throw new Error("Resource capacity exceeded");
    if (active < 0) throw new Error("Invalid resource capacity timeline");
  }
  return {
    booking: {...b},
    expectedResourceRevision: currentResourceRevision,
    nextResourceRevision: currentResourceRevision + 1,
    audit: {
      actorId: input.actorId, tenantId: b.tenantId, companyId: b.companyId,
      branchId: b.branchId, projectId: b.projectId, resourceId: b.resourceId,
      bookingId: b.id, action: "resource_booking_confirmed",
    },
  };
}
