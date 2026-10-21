# INV-005 — Atomic GRN-to-FEFO-Sale SQLite transaction pilot

**Date:** 22 October 2026. This is **NOT production POS** and is not deployed. Reuses native Minarva TypeScript `planFefoLotAllocations` and the established `KitSqliteTransactionDb` transaction pattern. No GPL/LGPL source, runtime dependency, migration, paid infrastructure or release.

## Implemented transaction cut

`packages/business-logic/src/lot-stock-sqlite-pilot.ts` provides two explicit opt-in operations using **separate pilot tables** (not the production Product, Stock, GRN or Journal tables):

- `initializeLotStockPilotSqlite`: opt-in `inv_lot_pilot_v1` versioned batch quantity table and `inv_lot_event_pilot_v1` unique persisted idempotency receipt/sale events.
- `receivePilotLotSqlite`: real SQLite `BEGIN IMMEDIATE` transaction to register or increment a receipt lot, stamp immutable org/warehouse/SKU/batch/expiry/status, recheck version and quantity, enforce unique batch and event identity, and persist a **host-provided receipt/financial SQL change in the same transaction**. An expired batch cannot arrive as `active`.
- `sellPilotLotFefoSqlite`: real SQLite transaction reads current persisted lots, delegates nearest-expiry/blocked/reserved FEFO allocation to existing tested planner, executes trusted **financial SQL callback in same transaction**, performs version-and-stock CAS for all lots, and records one immutable event and allocation result.
- Identical event-ID replay returns an `already_applied` disposition without charging/decrementing twice. Reuse of the same ID for changed quantity, kind or batch is rejected. If any writer, lot CAS, validation or event insert fails, the SQLite transaction rolls back **all** pilot changes including the financial callback.

Trusted warehouse scope authorization is mandatory. Invalid dates, wrong scope, invalid/overflow milli-units, wrong batch identity and unavailable/expired/blocked/reserved inventory fail closed. These are actual SQL transactions rather than in-memory calculation previews.

## Explicit safety boundaries

**NOT production POS.** None of the isolated pilot tables are attached to Minarva's `Product.stockQuantity`, WMS positions, live purchase/GRN, payments/GL, Electron preload, IPC or outbox. The callback check establishes only that **some SQL change** happened; it does **not prove** a valid financial journal, secure tenant ownership or idempotent payment. The host must own this callback and connection. Do not call any network, UI or renderer-supplied function as authority.

Before customer use: create one authoritative lot+product+warehouse ledger in SQLite and Supabase with RLS/server-authorized branch/device access; bind purchase/GRN and sale/refund/posting to this writer and the existing financial-sync outbox **atomically**, recheck money/stock version and payment uniqueness, reconcile old untracked inventory, implement returns/reversals, migrations, conflict resolution, integration tests and real Windows pilot UAT.

No production migration, customer data mutation, license change, live deployment, Windows release or percentage completion claim in this PR. Source rollback: revert PR.

## Exact-head tests

- `node --test packages/business-logic/src/__tests__/lot-stock-sqlite-pilot.test.mjs` using real in-memory sql.js SQLite
- `pnpm --filter @minarvabiz/business-logic typecheck`
- `pnpm --filter @minarvabiz/ui typecheck`
- GitHub CI, Windows packaging and installed deep smoke, feature-click, security/dependency/license gates, coverage, main post-merge validation.

Tests include GRN receipt and FEFO depletion, duplicate sale/receipt idempotency, cross-kind event conflict, expired/blocked shortage, wrong warehouse and authorization, no-op/failed financial callback rollback, partial multi-lot CAS sabotage, version update, uninitialized DB and source boundaries.
