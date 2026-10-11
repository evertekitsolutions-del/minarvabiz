# HR-005 — Windows Offline Holiday Calendar Review (Source Milestone)

**Status:** Pending exact-head CI, post-merge source verification and authenticated installed-app UAT.

## Existing code reused
- `holidayCache.listHolidayCache` and `validateHolidayCache`, loaded from native Windows SQLite v15 domain snapshot and protected by existing `staff.manage` role.
- Shared `holidayCalendar.previewHolidayCalendar`, `previewRosterHolidayReview` and `previewAttendanceHolidayReview`: validated tenant-scoped, branch-local civil days, annual/leap-day handling, bounded previews and deterministic conflict findings.
- Existing Windows `DesktopRosterPanel` (accessible via existing Roster navigation) and `phase6Store` staff attendance/roster readers.
- No third-party package, external code license, cloud inference API, paid infrastructure, new DB migration, web feature flag or Windows customer release.

## Behavior & safety
- Manager-only read-only review in the installed desktop roster planner; explicit branch and optional country scope; bounded period of at most 366 inclusive dates.
- Displays local SQLite holiday days, scheduled roster conflicts and attendance records requiring a manager's review.
- No rules: clear message that the local device has no authorized holiday snapshot. An old/offline snapshot may be stale, so no live Cloud policy, statutory holiday, leave, attendance or payroll claim.
- Rejects invalid dates, duplicate/foreign-tenant cached records and malformed context. Refuses to infer branch/country policies if context absent.
- Absolutely no `hydrateHolidayCache`, `setAttendance`, `assignRosterSlot`, Cloud mutation, automatic sync, holiday-pay decision or queue replay.

## Remaining acceptance
1. Verify exact-head PR checks including native Windows smoke/security and post-merge main; manually test with actual installed Windows SQLite profile and permission roles.
2. Bind a fresh, authenticated tenant-pinned cloud-to-Windows snapshot hydration with verifiable device identity, receipt/audit and conflict-safe transfer; don't treat local copy as authoritative.
3. Production HR005 SQL migration rollout only with explicit review, customer approval, rollback testing and feature flag verification (flag remains OFF).
4. Finish cross-device Offline/Hybrid revision-aware writes, statutorily reviewed attendance/leave/payroll policy and real customer UAT.

Whole Master Vision ~51% unchanged; last confirmed stable Windows customer installer v1.0.15.
