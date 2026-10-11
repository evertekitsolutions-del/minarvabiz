# HR-005 — Attendance / Configured Holiday Review

**Scope:** Deterministic, read-only source milestone. Source and tests require exact-head CI, post-merge verification and browser acceptance before the functionality can be considered production-ready.

## Uses existing implementations

- `packages/business-logic/src/holiday-calendar.ts`: tenant/country/organization/branch-specific civil-day rules, annual/leap-day handling and bounded read-only calendar preview.
- `packages/business-logic/src/phase6-store.ts`: `listAttendance({from,to})`, already guarded by `staff.manage`; no new data access privilege.
- `apps/web/src/components/roster/RosterHolidayCalendar.tsx`: existing feature-flagged authenticated online manager and roster preview.
- CI/testing uses existing Node, TypeScript, GitHub Actions; no external third-party code, paid service, new AI provider or runtime package was added.

## Behavior (manager evidence, not a payroll decision)

- Lists recorded attendance against **configured** nonworking days for a selected branch/country context. Conflicting company/branch treatments remain `contradictory_rules`.
- Highlights a manually recorded holiday without a configured nonworking rule as `unmatched_holiday_status` for review; **not proof** that the human entry is wrong or leave/pay should change.
- Branch-unspecified attendance in a specific branch review is `branch_scope_unverified`, **not** implicitly attributed to that branch. Explicit attendance belonging to another branch does not appear.
- All findings are sorted deterministically, reject duplicate staff/day and malformed identity/date/status; support up to one 366-day preview and 5000 caller-authorized rows.
- No holiday pay, overtime, leave entitlements, statutory calendars, attendance/roster mutations, local outbox changes, Cloud replay or automatic session changes.

## Required follow-ups

1. Exact-head and post-merge full CI; confirm Web/Windows tests and no regression.
2. Real manager/cashier/cross-tenant browser UAT and feature-flag/migration readiness (default OFF). No production holiday migration has been authorized.
3. Windows SQLite/Offline/Hybrid tested holiday-policy hydration, revision-aware sync and conflict handling; protect local backups.
4. Human-approved company/country calendar policy mapping for attendance, leave and payroll, including DST/local civil dates and legally required rules.

**Full Master Vision:** approximately 51% (unchanged). **Last confirmed customer stable installer:** v1.0.15.
