# UBP-05c — additive, database-enforced dimensional sale-line metadata

## What this change actually delivers

- Source-only migration `20261018_ubp05c_dimensional_sale_line_storage.sql`.
- A nullable `public.sale_items.dimension_metadata` JSONB column; existing
  plain POS rows continue without metadata.
- A pure, `SECURITY INVOKER`, immutable Postgres validator which rejects
  mismatched dimensions, derived milli-quantities, unknown schema keys,
  unsupported units, malformed decimal lengths, invalid piece counts and
  numeric quantities outside the live `NUMERIC(14,3)` sale-line bound.
- A `NOT VALID` CHECK constraint that **does** enforce the validator on all
  newly written/updated rows while leaving legacy data undisturbed.
- A write-once BEFORE UPDATE trigger forbids adding, replacing or deleting
  dimension metadata after insertion, even when the replacement quantity
  and dimensions are internally valid. Unrelated legacy updates and
  idempotent same-value updates remain supported.
- Real isolated PostgreSQL 17 regression tests (insert, update tampering,
  mixed units, half-up rounding, nullable legacy fallback, RLS invariants).
- Migration registered once in `supabase/MIGRATION_ORDER.txt`.

Calculation uses exact PostgreSQL numeric metre/area conversion factors and
round-half-up to match UBP-05a's picometre calculator; quantity remains in
thousandths, not floating points.

## Security and compatibility

This is *not* a new tenant, financial, pricing, stock or payment authority.
No `create_sale` RPC, POS UI, outbox, customer installation, print, RLS policy
or role change is included. New public validator has **no definer privileges**
and is pure boolean; public EXECUTE is revoked and normal authenticated
execution is granted for rows it is permitted to write.

No hosted Supabase migration was applied by this implementation. Before
production application: confirm production migration history, grants,
sale_items dependencies and existing CHECK names against the live project,
apply with monitored rollback/DB backup, then validate the constraint when
safe. `NOT VALID` is not a substitute for scheduled historical validation.

The check alone does **not** permit dynamic area POS: no current client RPC
passes metadata into `sale_items`. This work only stores a validated packet
when a trusted caller eventually provides it.

## Next milestone

Extend the *existing* atomic `create_sale` and desktop/offline snapshot
paths to carry optional dimension metadata, matching immutable sale-line
quantity after recomputation; perform authenticated business-profile gating
and defend against duplicate / conflicting sync. Then test the same sale
across Online, Offline and Hybrid, purchase/return and print outputs before
customer release.

## Run and verify

```bash
# GitHub CI tenant-sync-integration job: isolated PostgreSQL 17 service only
psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f scripts/ubp05c-dimension-sql-e2e.sql
```

The fixture wraps all data/DDL changes in BEGIN/ROLLBACK; it never targets
the hosted customer database. The migration itself is **not** executed from
the application.
