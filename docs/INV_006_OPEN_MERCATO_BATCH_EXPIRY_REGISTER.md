# INV-006 — Batch expiry register (Offline-first Windows slice)

**Date:** 2026-10-21. **Upstream source:** Open Mercato WMS expiry window, MIT Core, pinned commit `eb3193df03b9ce0b196be417fe265c1dc47c0868`.

## Shipped scope in source

Warehouse Management (shared Web + Windows surface) now includes **Batch expiry reminders (local register)**:

1. Select an active-branch product, warehouse, batch/lot reference and expiry date, optionally add notes.
2. Save expiry metadata (permission `inventory.adjust`, active branch stamp, audit action and existing `touchPersistence` integration).
3. Existing Windows Electron SQLite domain snapshot / manual backup now includes `batchExpiryReminders`, validated **before** import replaces local state. Historical snapshots without the optional field restore as an empty register.
4. Generate date-specific 30-day expiry report (permission `reports.view`), showing expired lots, expiring-soon lots including today and the 30th day, remaining days, warehouse and product name. Export formula-safe CSV.
5. Remove an expiry reminder with a confirmation, permission and audit trail. This removes local reminder metadata only, not the actual batch in warehouse stock.

**Code reuse:** unchanged Open Mercato Core MIT TypeScript `startOfUtcDay`, `addUtcDays`, `EXPIRING_SOON_DAYS` from:
https://github.com/open-mercato/open-mercato/blob/eb3193df03b9ce0b196be417fe265c1dc47c0868/packages/core/src/modules/wms/lib/expiry.ts.
The MIT copyright/permission/disclaimer and exact source are preserved under `THIRD_PARTY_NOTICES.md`. No upstream commercial modules, runtime dependency or hosted service are added.

## Limitations / safety

- This is a **locally persisted expiry REMINDER register**, **not** an authoritative WMS stock lot or stock quantity ledger. Nothing stops checkout of expired lots, decrements on-hand quantity or changes a purchase/GRN, invoice, price, GL, tax or inventory valuation. Physical count and SKU/lot assignment must be independently verified.
- Data is saved through the existing **desktop** SQLite domain snapshot/backup path. In a production Web app there is no new hosted persistence: editing creates in-memory reminders, which are not guaranteed durable; the UI must not advertise these as cloud-synced. Tenant/device enrollment, RLS, cloud tables, replication/reconciliation and production migrations remain deferred.
- Historical company-wide products/warehouses with null branch IDs can be chosen, but every reminder is stamped with the current ACTIVE branch and returned only for that branch. This does not replace authoritative tenant scoping at the database layer.
- Backup validation rejects duplicate lot keys and IDs, invalid dates, unexpected fields, oversized notes and malformed records. Old backups are supported without a snapshot schema version bump because the new field is optional. Cross-branch records remain present in the backup, but are filtered from the active-branch UI/report.
- Further full INV-005/INV-006: durable cloud lots with quantity, FEFO reservations, blocked/expired-stock sale prevention, branch authorization and multi-device reconciliation, imports, waste/recall trail and customer installed-runtime UAT.

## Tests / release

`node --test packages/business-logic/src/__tests__/batch-expiry-register.test.mjs`

`pnpm --filter @minarvabiz/business-logic typecheck`

`pnpm --filter @minarvabiz/ui typecheck`

Require exact-head CI, Windows installed smoke, coverage, security and main post-merge checks before merge. **No customer installer, database migration, production hosted deployment, new paid dependency or Master Vision completion percentage claim.** Roll back by reverting this PR (backups with newer optional fields remain parseable).
