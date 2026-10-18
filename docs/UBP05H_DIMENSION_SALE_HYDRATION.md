# UBP-05h — cloud sale-item dimensional audit hydration

## Implemented

`packages/database/src/client/mappers.ts` now preserves optional
`sale_items.dimension_metadata` as an immutable `SaleItem.dimensionMetadata`
on cloud sales list/detail queries. Legacy rows with NULL/missing metadata
retain their existing record shape.

The mapper validates the supported algorithm/schema, canonical field set,
input decimal syntax, measurement units, whole-piece count, numeric bounds,
and exact sale-line quantity in integer thousandths. Unrecognized or corrupt
audit fields throw rather than being silently discarded from the customer
sale history. PostgreSQL UBP-05c remains the authoritative exact area
recalculation and write-once constraint; the read mapper does not invent
a second area formula.

The legacy `db.sales.create` repository method now refuses dimension-bearing
records instead of silently dropping their metadata. The only intended cloud
mutation path for these sales is the authenticated, capability-checked,
transactional dimensional writer from UBP-05g.

## Scope boundaries

No hosted customer migration is performed. No new invoice print template,
return stock handling, automatic old-outbox replay, POS enablement, or Windows
installer publication. Cloud sale *read side* requires the server schema from
UBP-05c. Sync adapter's raw SQL row pull and independent financial replay
authorization still require full Windows/Hybrid acceptance testing.

## Regression

`node packages/database/src/__tests__/dimension-sale-hydration.test.mjs`
is included in the complete database test suite. Cases cover roundtrip,
legacy compatibility, tampering/version mismatch, and forbidding legacy
direct repository writes that would discard dimensions.

Full mandatory CI and Windows/browser smoke must pass before merge.
