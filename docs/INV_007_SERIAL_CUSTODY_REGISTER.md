# INV-007 — Serial / IMEI custody register (Windows Offline)

**22 October 2026 — implementation scope**

Adds a usable local per-item serial/IMEI record in **Warehouse Management**. Scanned or typed identifiers are linked to an active-branch product, warehouse and bin. It is deliberately separated from the authoritative inventory transaction ledger.

## Available workflow

- Register one physical serial/IMEI (letters, digits, dash, slash, period, colon, underscore) in an already allocated WMS location.
- Reject duplicates case-insensitively **across the entire local company snapshot**; source product and warehouse must be active and in the current branch.
- For units currently marked **in stock**, reject registration if other registered serials plus this one exceed the *whole* physical WMS on-hand units at the same product/bin. This is an inventory check at entry time, not a permanent stock reservation.
- Edit a record's **manual custody status**: in stock, marked sold, at service, retired. Marked sold requires a text reference. Every edit checks current branch permissions and optimistic expected-version; retirement is not silently reversible.
- Search by serial or reference, display statuses and export CSV with formula-injection protection.
- All changes create domain audit entries and trigger the current desktop `touchPersistence` mechanism.
- Serial records have been wired into `exportDomainSnapshotFull`, prevalidated `importDomainSnapshot` and desktop SQLite snapshot/backup restore. Older backups with no `serialCustody` field restore as an empty serial register, without a schema version change.
- Hosted production Web editing is **disabled** until tenant-authoritative cloud persistence exists. The shared browser UI is a read-only view on production Web.

## Boundaries before customer-complete INV-007

**No automatic sale/GRN/repair synchronization:** assigning `sold` or `service` is a manual custody note, not an authenticated invoice, customer warranty certificate, stock movement, credit note or return. No one can use this status to debit/create a financial ledger entry. A registered serial is not guaranteed to be physically present if other POS/WMS events subsequently move stock.

This is local Windows metadata, **not** a multi-device authoritative serial tracking register. Production launch needs transactional GRN intake, atomic sale serial consumption, serialized returns, QC, warranty service binding, device/branch enrollment, cloud tenant-safe sync/RLS and independent installed user testing.

## Verification gates

`node --test packages/business-logic/src/__tests__/serial-custody-register.test.mjs`

`pnpm --filter @minarvabiz/business-logic typecheck`

`pnpm --filter @minarvabiz/ui typecheck`

Plus exact-head CI, Web/Windows builds, Windows Deep Installed Smoke, browser smoke, coverage, licensing and security. No new npm dependencies or recurring paid infrastructure. No production migration, customer installer deployment, or Master Vision percent increase.
