# Attendance Online/Offline Parity Implementation Plan

**Goal:** Complete usable shared daily attendance entry, clock/break/overtime editing and durable cloud round trips without restarting HR-002.
**Spec:** PROJECT_CONTINUATION.md; docs/MASTER_PRODUCT_PLAN.md HR section.
**Architecture:** Reuse the existing phase6 store, shared grid, snapshot v13, authenticated PostgREST and optimistic versions. No new runtime dependency. Additive PostgreSQL security migration.

## Constraints
- Preserve all existing Online/Offline/Hybrid features and production fallbacks.
- No recurring paid service or externally copied code.
- Cloud writes must enforce organization-role authorization and same-tenant staff/branch references.
- Failed or conflicting writes remain visible and queued; never acknowledge a missing mutation.

## Review focus
Impossible dates, invalid clock ranges, metadata erased by status changes, stale/concurrent writes, direct API attempts by non-managers.

## Delivery
- [ ] Reproduce metadata loss and invalid input acceptance with executable store tests.
- [ ] Preserve optional fields, validate dates/status/minutes/clocks, snapshot immutable outbox payloads and increment attendance versions.
- [ ] Test and implement attendance route hydration, row mapping, awaited cloud writes and conflict feedback.
- [ ] Use one shared grid on web/desktop with day detail editor, history visibility and branch filtering.
- [ ] Add role/relation RLS enforcement migration and executable PostgreSQL tests.
- [ ] Run behavior, integration, type/build and exact-head CI gates; resolve defects before merge.
- [ ] Update continuation evidence and master-scope progress only after verified merge.
