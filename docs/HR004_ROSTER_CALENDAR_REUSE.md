# HR-004 shared roster monthly calendar — reuse and delivery review

**Milestone:** read-only month calendar view for existing shift/roster planner (Web + Windows). **Not HR-004 completion.**

## Reuse-first assessment (2026-10-11)

1. **Chosen — existing Minarva Business Logic:** `workforceRoster.rosterRange()` already tests real YYYY-MM-DD dates, statuses, staff filtering, stable ordering and cloned event results. Existing `RosterPlanner`, `RosterSlot`, `ShiftRule`, Button, shared React/Tailwind, authorized Web hydration and Windows SQLite/phase6 adapter are reused unchanged. The calendar does not create a second SQL/backend/sync/approval path.
2. **Considered — React Big Calendar:** https://github.com/jquense/react-big-calendar (upstream https://github.com/bigcalendar/react-big-calendar), MIT. Mature reusable event/calendar UI, but requires an additional library/localizer/styles and dependency lock/release review. React 19-compatible in version 1.20.0. Useful candidate for a later feature-complete interactive scheduling surface, **not** required for a purely read-only monthly view.
3. **Considered — FullCalendar Standard:** https://github.com/fullcalendar/fullcalendar, MIT for Standard/non-premium plugins; React component https://github.com/fullcalendar/fullcalendar-react. React 19 support. Premium scheduling/resources are separately licensed and **must not** be bundled into Minarva's commercial proprietary Windows installer without reviewed entitlements. More capabilities than this view needs.
4. **Decision:** reuse existing, audited Minarva schedule filtering and existing React UI first. Implement only a small presentation component with no new runtime dependencies, new paid infrastructure, GPL/AGPL code, upstream source copy or lockfile changes. Use external MIT calendar if needed for more advanced interactive features after a capability/size/portability review. This is not a permanent restriction or downgrade of future scheduling features.

## Delivered in this PR

- Shared `RosterMonthCalendar` exported from `@minarvabiz/ui`, wired to existing `RosterPlanner` used by both Web and Windows.
- Employee/month filters and branch-local date-only keys are inherited from current authorized snapshots. Uses Monday-first UTC-based **calendar arithmetic only**; it does not silently convert actual shift instants, calculate payroll, or alter the HR-004C server-enforced DST/rest roadmap.
- Month calendar shows each *scheduled* assignment, employee, shift, hours including overnight label, branch and event revision. Cancellation and correction remain available in original List view; same CSV export is retained.
- Read-only display: no event writer, drag/drop, remote read, new service role, new storage, automatic cloud replay, entitlement mutation or policy activation.
- SSR/contract regression covers leap months, first weekday, invalid month, escaped employee names (XSS), multiple shifts in a cell, deterministic sorting, no source mutation, authorized shared Web/Windows host usage and no calendar write path.
- Existing test/CI/security/Windows smoke gates remain mandatory before merge.

## Explicit open acceptance / no false claims

The calendar is a **display feature only**, not recurrence approval, schedule assignment authority, payroll calculation, live customer UAT or Offline/Hybrid full-recovery completion. It relies on existing tenant authorization and local/Cloud snapshot adapters. HR-004C active server UTC overlap/minimum-rest enforcement, approval revocation, recurring batch submit, cross-branch tenant UAT and a new verified Windows release remain uncompleted. Full Master Vision stays approximately **51%** unless separate verified meaningful whole-product functionality justifies adjustment.

**License/portability:** No third-party code was copied, no dependency added, no license/NOTICE adjustment required; existing Minarva proprietary source remains under its existing terms. Portable React UI; same logic works in Electron and Web. Zero recurring cost.
