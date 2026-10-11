# HR-005 Windows Offline Holiday Cache — safety checkpoint

**Status:** Source implementation under independent CI. Does not enable Offline holiday editing, payroll decisions, Cloud replay or unattended migrations.

## Prior work reused
- PR #335 native portable holiday engine: tenant/country/branch scope validation, annual/leap-day preview, roster exceptions as **read-only** review.
- PR #336 tenant RLS/role-checked PostgreSQL audit and optimistic revisions, currently **source-only**, not deployed to live Supabase.
- Existing Minarva Biz domain snapshot JSON in the native Windows SQLite `domain_kv`, autosave / backup/restore and import rollback system.

## This branch
- Extend domain snapshot schema from v14 to v15 with `holidayRules`; Windows SQLite and exported backups use the **existing** transactional persistence path.
- Keep all old snapshot versions (1–14) importable. Missing `holidayRules` is treated as empty; old business backups must not inherit another account's previous holiday cache.
- Validate full incoming snapshot before any state mutation, reject duplicate UUID, foreign organization mixed records, malformed branch IDs, invalid Gregorian dates and invalid revisions; copy fields and return cloned arrays.
- List is guarded by existing `staff.manage` permission. The cache cannot commit a holiday, set employee attendance, change payroll or auto-write Cloud.
- Add tests for v15 round trip, old v14 import and isolation, malicious snapshot rejection and rollback, cashier read denial.

## Outstanding for full HR-005 acceptance
1. Source exact-head/post-merge CI and actual Windows installed-app validation.
2. Secure organization-scoped Cloud-to-Windows hydration and durable conflict-aware sync; block tenant mixing on import/export.
3. Audit-controlled offline edits with ordered device events, server identity and receipt authority, encrypted backup/restore and partial-write recovery.
4. Authorized customer Browser and Windows UAT, leave/attendance/roster/payroll policies and country-specific entitlements under reviewed rules.
5. Controlled production schema rollout, feature flags and customer installer release. Do not activate solely from green CI.

**Full Master Vision:** remains approximately 51% until whole-product acceptance evidence. **Stable installer:** v1.0.15.
