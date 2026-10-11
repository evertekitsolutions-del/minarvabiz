# HR-005I — Read-only Cloud vs Offline Staff Review Impact

**Source milestone** — no customer acceptance, production activation, Cloud-to-Windows hydration, receipt authority or holiday sync permissions.

## Scope
Reuses the merged HR-005 holiday revision review, effective calendar impact engine, holiday cache validation, shared roster and attendance review engines, and the existing manager-only Cloud reconciliation screen.

When the authenticated manager selects an explicit organization, branch/country and bounded From/To dates, the Web UI reads existing authorized roster/attendance records. A pure comparison presents which **review findings** would differ under the local offline holiday policy vs a fresh authenticated tenant-RLS Cloud holiday snapshot. This includes changed assignment non-working-day conflicts and attendance exceptions. Neither side is automatically authoritative for changing staff statuses.

- Reject malformed/duplicate/mixed-tenant rule caches, invalid/too-long windows, oversized staff collections, duplicate roster identities and duplicate staff/date attendance rows.
- Explicit branch/country context prevents applying unmatched scoped rules. Changing the context clears stale results.
- All raw staff rows come from caller-authorized tenant-scoped store readers. This pure function **does not authenticate roster/attendance identities** or grant RLS access; that remains at the existing caller/server boundary.
- Existing cancelled shifts and mismatching branches are not treated as staff exceptions.
- Always read-only: no changes to holiday cache, Cloud tables, roster, attendance, leave, payroll, outbox, license, permissions or device state.

## Required before production
1. Verify exact-head CI and post-merge main CI; run real authenticated manager/cashier and installed Windows customer UAT.
2. HR-005 source SQL migration `20261011_hr005_holiday_rules.sql` has NOT been applied to production as of the read-only connector verification on 2026-10-11. `NEXT_PUBLIC_HR005_HOLIDAYS_READY` stays OFF.
3. Implement independently authorized tenant/device-bound Cloud-to-Windows snapshot receipts and durable Offline/Hybrid revision/conflict resolution; this preview grants no hydration/replay authority.
4. Complete country-reviewed statutory leave/attendance/payroll policy and verified release acceptance.

No new package, paid API, infrastructure, production migration or stable installer in this source slice. Overall Full Master Vision remains ~51%; last confirmed stable Windows customer installer v1.0.15.
