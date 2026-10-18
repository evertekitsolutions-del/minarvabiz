/**
 * UBP-04a: pure booking grid preflight. NOT a confirmed reservation.
 * Authoritative resource capacity and tenant isolation must be rechecked
 * inside a transaction on the server or reconciled after offline sync.
 */
export type ResourceBookingStatus =
  'draft' | 'held' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export interface ResourceBooking {
  readonly id: string;
  readonly orgId: string;
  readonly branchId: string;
  readonly resourceId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: ResourceBookingStatus;
}
export interface ResourceAvailabilityInput {
  readonly orgId: string;
  readonly branchId: string;
  readonly resourceId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly capacity: number;
  readonly bookings: readonly ResourceBooking[];
  /** When editing an existing booking, ignore only that booking's allocation. */
  readonly bookingId?: string;
}
export interface ResourceAvailabilityPreview {
  readonly available: boolean;
  readonly peakConcurrent: number;
  readonly overlappingBookingIds: readonly string[];
}
const BOOKING_STATUSES = new Set<ResourceBookingStatus>([
  'draft', 'held', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show',
]);
const BLOCKING_STATUSES = new Set<ResourceBookingStatus>(['held','confirmed','in_progress','completed']);
const validId = (v: unknown): v is string => typeof v === 'string' && !!v.trim();

/** Reject local wall-clock timestamps: DST ambiguous/nonexistent local hours. */
function parseInstant(value: unknown): number {
  if (typeof value !== 'string') throw new Error('Invalid booking time');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new Error('Invalid booking time');
  const [,yyyy,mm,dd,hh,mi,ss,,offset] = match;
  const date = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0,10) !== `${yyyy}-${mm}-${dd}` ||
    Number(hh) > 23 || Number(mi) > 59 || Number(ss) > 59) throw new Error('Invalid booking time');
  if (offset !== 'Z') {
    const hours = Number(offset.slice(1,3)), minutes = Number(offset.slice(4,6));
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) throw new Error('Invalid booking time');
  }
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) throw new Error('Invalid booking time');
  return instant;
}
function parseInterval(start: string, end: string): readonly [number,number] {
  const a = parseInstant(start), b = parseInstant(end);
  if (b <= a || b - a > 30*24*60*60*1000) throw new Error('Invalid booking interval');
  return [a,b];
}

export function previewResourceAvailability(input: ResourceAvailabilityInput): Readonly<ResourceAvailabilityPreview> {
  if (!input || ![input.orgId,input.branchId,input.resourceId].every(validId) || !Array.isArray(input.bookings) ||
      (input.bookingId !== undefined && !validId(input.bookingId))) throw new Error('Invalid booking scope');
  if (!Number.isSafeInteger(input.capacity) || input.capacity < 1 || input.capacity > 500) {
    throw new Error('Invalid booking capacity');
  }
  const [candidateStart,candidateEnd] = parseInterval(input.startsAt,input.endsAt);
  const seen = new Set<string>();
  const overlappingIds: string[] = [];
  const events: Array<{at:number; delta:number}> = [
    {at:candidateStart,delta:1}, {at:candidateEnd,delta:-1},
  ];
  for (const row of input.bookings) {
    if (!row || row.orgId !== input.orgId || row.branchId !== input.branchId) {
      throw new Error('Booking scope mismatch');
    }
    if (!validId(row.id) || !validId(row.resourceId) || !BOOKING_STATUSES.has(row.status)) {
      throw new Error('Invalid booking identity or status');
    }
    if (seen.has(row.id)) throw new Error('Duplicate booking id');
    seen.add(row.id);
    const [start,end] = parseInterval(row.startsAt,row.endsAt);
    if (row.id === input.bookingId || row.resourceId !== input.resourceId || !BLOCKING_STATUSES.has(row.status)) continue;
    if (start >= candidateEnd || end <= candidateStart) continue;
    overlappingIds.push(row.id);
    events.push({at:Math.max(candidateStart,start),delta:1});
    events.push({at:Math.min(candidateEnd,end),delta:-1});
  }
  events.sort((a,b)=>a.at-b.at || a.delta-b.delta);
  let concurrent = 0, peakConcurrent = 0;
  for (const event of events) {
    concurrent += event.delta;
    if (concurrent > peakConcurrent) peakConcurrent = concurrent;
  }
  return Object.freeze({
    available: peakConcurrent <= input.capacity,
    peakConcurrent,
    overlappingBookingIds: Object.freeze(overlappingIds.sort()),
  });
}
