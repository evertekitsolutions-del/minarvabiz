# INV-005 — Atomic SQLite FEFO Hold / Cancel / Sale Settlement (pilot)

**2026-10-22 — NOT production POS.**

## Functionality delivered

Opt-in `inv_lot_reservation_pilot_v1` on the existing isolated SQLite lot pilot, sharing the **single tenant-scoped event-id namespace** with GRN, sales, returns and QC. Three host-only synchronous operations use `db.transaction` and immutable, persisted lot allocations:

- `reservePilotFefoLotsSqlite`: takes available (on-hand minus reserved) lots in nearest-expiry FEFO order; increments per-lot `reserved_milli` and `version` using full version, identity, stock and status compare-and-swap; stores a unique reservation and immutable source allocations.
- `cancelPilotFefoReservationSqlite`: returns those exact held quantities to available stock without changing `on_hand_milli`; terminal cancellation event and status in the same transaction; duplicate cancellation replays without another debit/credit.
- `commitPilotFefoReservationSaleSqlite`: rejects holds that expired, were blocked, changed SKU/batch or lost reserved/on-hand stock. Executes a **host-owned financial SQL writer**, debits exact reserved lots, reduces both `on_hand_milli` and `reserved_milli`, records a standard sale event compatible with the existing sale-return/quarantine workflow, and terminally settles the hold. Duplicate sale IDs replay without financial callback or repeat debit.

All three validate trusted host authorization for tenant and warehouse **inside** the transaction. Reused IDs with changed payload/kind are rejected. Insufficient, malformed or unsafe quantities, SQL callback no-ops, CAS conflicts, invalid dates and double settlement are fail-closed. `BEGIN IMMEDIATE` plus rollback is required from the host database adapter.

## SQLite tests

`node --test packages/business-logic/src/__tests__/lot-reservation-sqlite-pilot.test.mjs`

Tests exercise two-batch FEFO, event replay/collision, blocked/expired stock, different tenant, release without stock loss, full settlement and duplicate-charge guard, second-lot CAS sabotage rolling back the first debit and financial callback, and an end-to-end reserved sale → previous return/quarantine code path.

## Delivery limitations

**NOT production POS.** This is a host-invoked opt-in SQLite pilot, not the real Product/WMS stock ledger, customer Sales, GRN, payment, refund, journal or tenant-authorized outbox. It does **not** add a production migration or alter any existing desktop/host tables. Calling the financial callback simply confirms **some SQL change**, not valid financial accounting. The host must derive trusted organization and branch, keep all writers in the same native SQLite connection and transaction, validate actual payment/credits and bind its outbox atomically. Separate Cloud Postgres writer and device conflict rules are not implemented.

Existing pilot database event CHECK constraints cannot be expanded by `CREATE TABLE IF NOT EXISTS` alone; use a verified explicit version migration before running against any persistent pilot database initialized on old builds. No production migration, customer release, paid dependency or change to the Full Master Vision completion estimate.

Exact-head CI, Windows installed smoke, coverage/security/licensing required before merging.
