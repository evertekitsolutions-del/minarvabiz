# UBP-04a — Resource Booking Grid Preflight

Status: **pure calculation only**; no booking table, confirmed slot, payment,
staff shift mutation, database RPC or offline synchronization shipped.

Built on existing `packages/business-logic/src/appointments.ts` (legacy
appointment validation), this new tenant/branch-scoped preview is intended
for future Service, salon, spa, turf, equipment rental and technician layouts.

## Input contract
`previewResourceAvailability({orgId, branchId, resourceId, startsAt, endsAt,
capacity, bookings, bookingId?})` accepts a candidate appointment (resource,
fully timezone-qualified ISO start/end), integer capacity 1–500 and an array
of existing rows already obtained under server-verified org/branch scope.
An optional booking ID excludes exactly that appointment for edit previews.
Inputs and results are immutable from this function's perspective.

## Correctness rules
- Reject foreign tenant/branch rows even if their resource differs (no leaks).
- Reject missing IDs, duplicates, unknown states, invalid date/calendar/time,
  ambiguous wall-clock dates without offset, equal/reversed intervals and
  durations beyond 30 days.
- Treat confirmed, held, in-progress and completed as occupying capacity;
  draft, cancelled and no-show as non-blocking.
- Check **peak simultaneously occupied capacity**, rather than simply
  counting all reservations overlapping a broad candidate interval.
- Adjacent times are nonoverlapping half-open intervals; timezone offsets
  are normalized before comparison.
- Outputs `available`, `peakConcurrent` and sorted
  `overlappingBookingIds`, with read-only frozen result.

## Non-authoritative warning
This is UI **preflight only**. Two users can observe a free slot at the same
time. Confirmed booking requires the planned PostgreSQL resource and booking
tables, composite tenant foreign keys, authenticated RLS, concurrency-safe
capacity check / exclusion lock and transactional reservation, plus SQLite
offline provisional states and explicit conflict reconciliation. Never
mark a slot confirmed, take a deposit or recognize accounting revenue based
only on this function.

## Verification
Run `node --experimental-strip-types --test
packages/business-logic/src/__tests__/resource-booking.test.mjs`.
CI additionally runs the full existing Windows, web, license and sync suites.
