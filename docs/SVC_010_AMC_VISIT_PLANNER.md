# SVC-010 — AMC Maintenance Visit Planner (first customer-visible slice)

**Upstream research:** Dolibarr Services/Interventions and ERPNext Maintenance Schedules are functional inspiration only. No external GPL source code, templates or runtime dependencies were copied. This is original provider-neutral TypeScript.

## Working journey

1. In shared Web/Windows **Services & Orders**, expand **Plan AMC visits**.
2. Select an existing customer, enter contract reference, start/end calendar dates, months between visits, optional checklist.
3. Click **Preview AMC schedule** for deterministic future visit dates and count, including January 31 month-end and leap-year handling.
4. Export an operator-reviewable UTF-8 CSV with customer, contract, visit sequence/date and notes.

The current planner makes a **proposal**, not a contract or actual service work order. It never books a technician, bills an AMC, auto-sends WhatsApp, changes customer records, posts stock/financial entries, or writes to an outbox. Max five calendar years and 61 visit records. No paid infrastructure, customer database write, migration or release.

## Acceptance remaining for complete SVC-010

Durable authoritative tenant/branch scoped AMC contract store, contract lifecycle and renewals, permission checks and approvals, assignment of visit jobs/technicians, reminders with customer consent, SLA calendar, cancellation/rescheduling, audited posted invoices, Offline/Hybrid conflict handling and customer UAT. Do not mark the full SVC-010 capability complete yet.

## Verification

- `node --test packages/business-logic/src/__tests__/amc-visit-planner.test.mjs`
- `pnpm --filter @minarvabiz/business-logic typecheck`
- `pnpm --filter @minarvabiz/ui typecheck`
- Exact-head GitHub PR CI (including installed Web/Windows) and post-merge main checks before declaring source milestone passed.

No production migrations, releases or deployments without owner authorization. Rollback: revert the SVC-010 PR; existing order recording is unaffected.
