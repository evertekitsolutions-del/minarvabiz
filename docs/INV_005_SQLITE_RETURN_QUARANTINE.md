# INV-005 — Sale return → original lot allocation → quarantine (SQLite pilot)

**2026-10-22 | No production migration or customer release**

## Transaction feature

Extend the existing explicitly initialized **isolated** lot pilot tables with `return` event IDs and two independent tables: `inv_lot_return_pilot_v1` (links an original sale, sums return quantities) and `inv_lot_quarantine_pilot_v1` (batch-specific custody). All tables are populated only when `initializeLotStockPilotSqlite` is explicitly run by a trusted test/host.

`acceptPilotLotReturnSqlite` now executes **one synchronous SQLite transaction** which:

1. Requires the trusted host's warehouse authorization, stable tenant/return/sale identifiers, valid return business date and milli-unit quantity, and a host-owned financial refund SQL writer.
2. Loads the **persisted** original sale event and its FEFO lot allocations. Rejects incorrect tenant, warehouse, SKU, non-sale source, earlier-than-sale return dates, corrupted source amounts.
3. Reads all previously committed partial returns **inside the same SQLite transaction**, verifies their per-lot origin and amounts, and refuses any aggregate return greater than the originally sold stock.
4. Selects refundable quantities from the original persisted sale lots in deterministic sequence. Returns are linked to exact sold batch codes, not arbitrary caller-supplied batches.
5. Executes the trusted host refund/return accounting writer *inside the same transaction* and verifies a SQL change (not proof of correctness). Inserts the return event, unique return attribution, and lot-wise quarantined custody records. Any failing step rolls back the entire event and refund.
6. For an **identical return ID replay**, verifies both return and quarantine persisted records and returns `already_applied` **without repeating a refund or any stock change**. A colliding ID for a sale/receipt or different quantity/date is rejected.

**Deliberately no restock:** Saleable `inv_lot_pilot_v1.on_hand_milli` is unchanged for returned goods. Expired/damaged/fraudulent returns cannot silently re-enter checkout. A separate authorized inspection-and-release transaction is needed before any stock credit.

## Critical scope exclusions

**NOT production POS.** This is a tested SQLite pilot, not a connected sale-return or stock/financial ledger in Minarva's Windows/customer workflow. Pilot schema only; not on the real Product/WMS stock, sales return table, GL, device/outbox, remote branch sync or production Supabase. Do not automatically apply pilot schema, expose APIs to an untrusted Electron renderer, or assume a SQL write proves a valid refund.

Full next stage: review/reject/quarantine release, a unified authoritative lot+Product+WMS ledger transaction, offline device enrollment, sync/version/replay handling, business payment/credit-note validation, production-ready migrations (only with owner authorization) and real Windows pilot UAT.

## Verification

`node --test packages/business-logic/src/__tests__/lot-return-sqlite-pilot.test.mjs`

`node --test packages/business-logic/src/__tests__/lot-stock-sqlite-pilot.test.mjs`

`pnpm --filter @minarvabiz/business-logic typecheck`

Plus exact-head GitHub Web/Desktop tests, Windows packaging and installed smoke, security, licensing, coverage and post-merge main CI.

No new paid services, third-party source copied, runtime packages or claim that Full Master Vision % increased.
