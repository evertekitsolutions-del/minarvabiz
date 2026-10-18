# UBP-05b — canonical dimensional sale-line audit metadata

Scope: a single **non-deployed, pure TypeScript contract** that converts the UI's
UBP-06a `DimensionMeasurement` into a canonical JSON-safe record and
recomputes an untrusted record's quantity before it may be attached to a
future bill line. No change to financial mutation, POS UI, schema, customer
SQLite snapshots, production data, entitlement, invoice print or hosted API.

## Contract

`PersistableDimensionLineV1`: schema `dimension-line-v1`, algorithm
`area-v1`, length and width strings, their separate input units, billable
area unit, whole pieces, and exact quantity in integer thousandths.
`dimensionLineMetadataFromMeasurement()` builds a frozen canonical record.
`parseDimensionLineMetadata(payload, expectedQuantityMilli)` rejects
unknown/missing fields, unsupported versions, exotic object prototypes,
accessors, invalid dimensions/units, tampered derived quantity and fractional
or mismatched expected line quantity.

The existing integer-picometre calculator is the only area math authority;
no price, tax or cost is accepted in the measurement record. A quantity above
the `sale_items.quantity NUMERIC(14,3)` limit is rejected before future
persistence. A JSON roundtrip is tested for Windows snapshot compatibility.
The eventual checkout boundary **must** pass the sale item quantity in integer
thousandths for comparison, then perform its separate stock, pricing, tenant,
role and atomic payment/ledger checks.

## Boundary / rollout

- The existing `CartLine` and `SaleItem` intentionally remain unchanged.
- There is **no** sale-items PostgreSQL migration, no new RPC, no migration
  applied to Supabase and no customer-facing POS enablement in this PR.
- This packet is **not** a cryptographic signature or authorization proof.
  Untrusted clients must never be trusted to determine billable quantity or
  inventory movement merely because this parser passes.
- Next milestone: additive `sale_items` storage migration and authoritative
  `create_sale` RPC transaction validation; safe SQLite/Supabase hydration,
  full offline/online parity; controlled POS attachment behind entitled
  business profile; stock/returns, printing, conflicts and customer acceptance.

## Regression

```bash
node --experimental-strip-types --test packages/business-logic/src/__tests__/dimensional-billing.test.mjs packages/business-logic/src/__tests__/dimension-row-draft.test.mjs packages/business-logic/src/__tests__/dimension-line-metadata.test.mjs
pnpm --filter @minarvabiz/business-logic typecheck
```

GitHub `CI` now executes the new test file with the existing dimensional
preflight suite. PR must not merge while mandatory checks are pending or red.
