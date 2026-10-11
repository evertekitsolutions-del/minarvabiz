# HR-005 — Cloud vs Offline Effective Calendar Impact (Source-only)

**Status:** Feature branch; exact-head CI, merge and customer UAT require separate confirmation.

## Intent
The existing HR-005 manager-only Web console compares tenant-scoped holiday **rule revisions** after a fresh authenticated Cloud read. This bounded addition also shows the **effective branch-local days** impacted by differences when an explicit From/To date window is selected.

- Reuse `holidayCache.validateHolidayCache`, `holidayCalendar.previewHolidayCalendar`, existing manager authorization, holiday revision review and existing Web UI.
- Every input must match the same explicit organization UUID. Reject mixed/duplicate/corrupt snapshot identities, bad civil dates, invalid country/branch context and periods over 366 inclusive dates.
- Deterministically compare both effective holiday treatments and applicable configured rule IDs for each selected day; list differing days only.
- A name-only revision or other non-calendar change stays visible in the **separate revision review** and is not falsely presented as a changed workday.
- Select branch/country and dates BEFORE comparing; changing context clears stale results.
- No new dependencies, paid APIs, new migrations, Cloud writes, SQLite hydration, outbox replay, automatic policy approval, customer release or changed default flags.

## Authority boundary
This is a **read-only preflight**, NOT Cloud-to-Windows data hydration, conflict settlement, proof of a complete Cloud snapshot, device identity/receipt authority, a payroll entitlement or legal leave rule. Fresh authenticated manager read + tenant RLS remain upstream of the pure comparator. Production SQL migration `20261011_hr005_holiday_rules.sql` remains unapplied and `NEXT_PUBLIC_HR005_HOLIDAYS_READY` must stay OFF until independently authorized rollout.

## Still required
- Exact-head/post-merge CI, actual authenticated Windows/Web UAT, production flag/schema verification.
- Durable tenant/device-bound Cloud-to-Windows receipts, reviewed cross-device version reconciliation and crash-safe Offline/Hybrid synchronization.
- Leave, attendance and country-specific payroll policy acceptance before any automatic employee status/pay decision.

FULL Master Vision remains **~51%**, not automatically changed by a PR or green CI. Stable customer Windows release remains **v1.0.15**.
