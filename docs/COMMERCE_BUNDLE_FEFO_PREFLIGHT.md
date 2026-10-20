# Aimeos-style bundle / kit stock preflight — foundation

Date: 2026-10-20. Increment toward INV-017 / COM-003 (tracker #325).

A `preflightCommerceBundleStock()` pure TypeScript planner is now available, composed from Minarva's existing `planFefoLotAllocations()`.

- Takes verified organization + warehouse scope, business date, positive whole bundle count, required SKU component milli-units and a scoped stock-lot snapshot.
- **Aggregates repeated SKUs before allocating FEFO lots** so the same physical stock is not double-promised when a bundle includes a SKU twice.
- Uses BigInt for intermediate multiplication and combined SKU quantities; blocks unsafe integer overflow without quantity truncation.
- Rejects cross-org/cross-warehouse lots, duplicate lot IDs, unrelated products, invalid/expired/blocked lot units and shortage at any SKU. Result is all-or-throw and read-only.
- All returned plans are frozen. Source lots/stock state never mutate.

This is **not** bundle SKU persistence or sale, bundle pricing, inventory reservation, checkout, POS enforcement or a committed stock transaction. At final invoice/sale time an authoritative SQLite/Postgres transaction must re-read/lock each SKU, revalidate all lot availability and commit stock + financial idempotency together. Do not send this preview as proof of available sellable stock to cloud.

No third-party runtime/code copied; Aimeos inventory bundle approach is a design reference only. No migrations, new dependencies, deployment, production data or Windows installer release.

Tests: `packages/business-logic/src/__tests__/commerce-bundle-stock.test.mjs`. Supports next stage: atomic bundle reservation/fulfilment alongside existing A-SYNC-V2 authority work.
