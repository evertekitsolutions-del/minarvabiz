# UBP-05e — atomic dimension-aware sale RPC

## Summary

Replaces only the existing `public.create_sale(jsonb,jsonb,boolean)`
body, preserving the existing authentication, organization membership,
stock row locking, stock deduction, sales, inventory transactions, customer
balance, payment inserts, and idempotent sale ID contract.

New dimensional lines send optional `dimension_metadata` JSONB
(with the UBP-05c schema version) in `p_sale.items[*]`. The function
rejects unsupported camelCase `dimensionMetadata` at the SQL boundary
instead of silently dropping it, recomputes quantity using
`public.ubp_dimension_line_valid(metadata, quantity)`, rejects
sub-milli input drift before numeric column rounding, and writes the
canonical audit to `sale_items` **inside the initial atomic INSERT**.
No post-commit UPDATE is permitted.

An idempotent retry with an existing dimension-bearing invoice compares
all submitted items, quantities and metadata against the saved sale. An
altered/removed metadata field or item count fails with `23505`, not
a false cloud-acknowledged idempotent result. Ordinary sales without
dimension metadata retain the existing idempotent behavior.

## Boundaries

- SQL source migration only. **Not deployed to hosted Supabase**.
- No cloud-writer switch, service-role exposure or customer POS enablement.
- No changes to RLS policies, offline outbox permission authority, client
  licensing, stock/journal calculations, or branch grants.
- The existing UBP-05d direct-writer/outbox guard **remains required** until
  an authenticated client transport maps `dimensionMetadata` to
  `dimension_metadata`, sends it to the updated RPC and verifies durable
  acknowledgement.
- There is no automatic replay of previously rejected financial batches.

## Validation

- `node --test scripts/ubp05e-dimension-rpc-contract.test.mjs`: source
  contract and migration manifest order, exact protections.
- `node scripts/ubp05e-dimension-rpc-fresh-e2e.mjs`: first-admin fresh
  instance after full migration replay, verifies PostgreSQL installed
  function/security boundary, validator and write-once trigger.
- Existing `ubp05c-dimension-sql-e2e.sql` checks exact numeric rounding,
  NULL bypass, legacy rows, immutable metadata and tamper resistance.
- All mandatory exact-head CI checks must pass before merge.

No paid infrastructure needed. Target remains Windows Offline, Online,
Hybrid with shared sale data and safe tenant/branch isolation.
