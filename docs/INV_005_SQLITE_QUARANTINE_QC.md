# INV-005 — Quarantine QC release/reject SQLite pilot

**22 October 2026 — NOT production POS**

Completes a deliberately isolated *pilot* goods-return custody lifecycle:
GRN lot receipt → FEFO sale debit → sale return quarantine → inspected
**release** or **reject**.

## New implementation

`decidePilotLotQuarantineSqlite` operates on a **single original returned batch allocation** and must be invoked by a trusted host connection and an explicit QC-privileged authority. It reads persisted return/quarantine rows and original sale-lot stock within **the same SQLite transaction**:

- `release`: only active, nonexpired, identity-matching source lots are eligible. Increments isolated pilot on-hand and lot version via source-row compare-and-swap, updates quarantine status to `released` via status/quantity CAS, persists one global QC event ID. Requires a host-owned same-transaction inventory review SQL callback that changes a database row.
- `reject`: updates quarantine status to `rejected` and persists the inspection event, but does **not** credit stock. May reject expired, blocked or damaged returned batches.
- Identical inspection-ID replay checks the stored payload, batch custody quantity and terminal status, and returns `already_applied` **without calling the ledger callback**. A changed-ID collision or second decision for the same returned lot is rejected.
- Any account callback error, late lot conflict, custody CAS error or invalid business date causes the entire SQLite transaction to roll back.
- Previously saved sale-return replays continue to work after QC, without issuing a second refund, even when custody is `released` or `rejected`.

## Explicit constraints

**NOT production POS.** Pilot schema is opt-in and not attached to real Minarva Product/WMS stock, invoices, GRN, payment, journal, backups, cloud sync, tenant RLS or Electron IPC. The SQL callback proves only that **some** SQL change happened; it is NOT proof of a valid credit note, tax adjustment, QA inspection or inventory journal. In production, authentication, organization and branch ownership, QC role, warehouse ledger, revision locking, refunded money, return customer ownership and outbox replication must be verified by a trusted transaction boundary. The shared legacy pilot schema must be freshly initialized or explicitly version-migrated for QC event/status support; `CREATE TABLE IF NOT EXISTS` does not upgrade existing pilot constraints.

## Verification

`node --test packages/business-logic/src/__tests__/lot-quarantine-qc-sqlite-pilot.test.mjs`

`node --test packages/business-logic/src/__tests__/lot-return-sqlite-pilot.test.mjs`

`node --test packages/business-logic/src/__tests__/lot-stock-sqlite-pilot.test.mjs`

Exact-head Web/Desktop/Windows smoke, business logic suite, coverage, license/security policy before merge. No new dependency, recurring paid service, production migration/release or percentage completion claim.
