# INV-017 — Kit reservation lifecycle: versioned CAS transaction plans

2026-10-21. Original Minarva TypeScript, no upstream PHP or third-party runtime. Builds on merged PR #560 (FEFO saved-kit stock preflight).

## Delivered in this PR

- `planKitReservationCreate`: aggregate duplicate component SKUs, validate a trusted organization/warehouse lot snapshot and produce a **new reservation record plus sorted, immutable stock-lot compare-and-swap patches** using the current shared FEFO allocator. Each patch carries the expected lot version and next reserved stock.
- A known, previously persisted reservation ID with exactly the same scope, date, kit count and normalized SKU composition returns `already_reserved` and **zero** lot mutations. Reusing the ID for different input, or for an already released/fulfilled reservation, fails closed.
- `planKitReservationFinalize`: from a persisted, active, expected-version reservation record, derive release patches (decrease reserved quantity only) or fulfillment patches (decrease both on-hand and reserved quantity), and the next versioned reservation state. It rejects stale/double-finalized states, mismatched aggregate components, missing/reassigned/duplicate lots and insufficient reserved inventory.
- Read-only, immutable inputs and outputs. BigInt intermediate quantities and safe integer/stock-version guards prevent overflow. Expired, blocked, already reserved or out-of-scope inventory does not satisfy initial FEFO availability.

## Critical trust and consistency requirements

**These are transaction proposals, NOT a stock reservation implementation deployed to production.** A caller must read lot versions and idempotency rows from an authenticated, authorized database boundary. An authoritative SQLite or PostgreSQL transaction must acquire tenant/warehouse locks, enforce a unique `(organization_id, reservation_id)`, compare every expected lot AND reservation version, revalidate FEFO/expiry/ownership, and persist ALL kit reservation rows and lot movements atomically. For fulfillment, sale/invoice/payment/financial-sync idempotency must commit within the same transaction, not in a later callback. On any stale version, abort and retry from a fresh trusted read.

Browser state, cloud unsigned fields and locally supplied `existingReservation` values are **not trusted grants**. A local/online writer and durable schema are still **future work**; do not expose this planner as a retail checkout or modify current POS, stock ledger or outbox.

No database migration, paid provider, package dependency, production deployment or installer publication. Refs #325 and prior #560. Tests: `packages/business-logic/src/__tests__/commerce-kit-reservation-transitions.test.mjs` (8 groups).
