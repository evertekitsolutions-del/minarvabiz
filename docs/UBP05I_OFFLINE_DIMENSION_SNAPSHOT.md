# UBP-05i — Windows offline dimensional invoice snapshot guard

## Actual Windows storage boundary

The current Electron Windows client persists a complete
`DomainSnapshot` inside SQLite `domain_kv` as `domain_snapshot_v2`;
its production restore uses `importDomainSnapshot`. It does **not**
automatically persist each invoice through the separate
`createSqliteUnitOfWork().sales.create` table writer.

This change validates every dimension-bearing `snapshot.sales[*].items[*]`
**before any state is hydrated**, using the same UBP-05a/05b exact
bigint area calculation, canonical `dimension-line-v1` audit schema,
piece count, unit conversion and integer-milli quantity precision.
Validated metadata is copied into an immutable canonical audit packet.
Corrupt input, unsupported versions, and sub-milli quantity drift cause
the entire restore to be rejected, leaving the previous Windows snapshot
and active sale state intact.

Old invoices with no dimension field, and historical snapshot versions
supported by the existing importer, keep their existing value shapes.
No upgrade of the `domain_snapshot_v2` key or SQLite schema is
needed for this protection.

## Tests

`packages/business-logic/src/__tests__/dimension-offline-snapshot-guard.test.mjs`

- Valid dimensional sale survives JSON export/import and is still present
  on full domain re-export.
- Forged length, quantity, algorithm, version, extra fields and invalid
  numeric inputs fail validation.
- Failed imports cannot overwrite the last restored dimensional invoice.
- Legacy non-dimensional invoice has no synthetic audit property.

Test-first RED was confirmed on the prior PR head: the corrupted
length `13` was accepted. Implementation was committed afterward.

## Not enabled

No customer installer release, hosted Supabase migration, POS measurement
input UI, legacy direct-table financial replay or automatic cross-device
financial settlement is changed. Distinct SQL row-level SQLite repository
parity and financial restore/returns/print acceptance still need
their own migration and tests, without overwriting existing customer data.
