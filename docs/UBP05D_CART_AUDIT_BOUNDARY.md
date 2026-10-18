# UBP-05d — dimensional cart → immutable local sale audit

## Scope

The shared cart and invoice sale-item types have an optional
`dimensionMetadata: DimensionLineMetadataV1 | null` property. Legacy carts
and all ordinary sale items do not gain any field or changed totals.

`validateCart` now recomputes every dimensional line with the existing
UBP-05a exact bigint area calculator and rejects malformed metadata,
stale/forged quantity or mismatched piece count before checkout mutation.
`cartLineToSaleItem` repeats the check and copies only canonical frozen
metadata into the saved sale item. This protects local snapshots,
outbox provenance, returns/history and later printing from input mutation.

**Cloud safety:** Existing authenticated `create_sale` SQL ignores the
new field and therefore cannot yet persist it. For any dimensional sale,
`remoteCreateSale` first durably queues the sale and payment group,
then records an explicit failed status explaining that the current atomic
cloud RPC does not support measurement metadata. It **does not** call the
older RPC or mark the sale/payments synced. This is a deliberate
fail-closed cutover gate, not completed online functionality.

## Release boundaries

No hosted database migration, customer installer, POS UI activation,
billing price changes, feature flag changes, RLS changes, licensing changes,
automatic financial retry or new infrastructure are included. Offline
checkout metadata support must remain non-customer-facing until the
authoritative online RPC, tenant/branch authorization and replay/rollback
parity have been implemented and tested.

The existing UBP-05c `sale_items.dimension_metadata` SQL constraint
and write-once trigger apply only after the hosted migration is
reviewed and safely deployed.

## Verification

Tests:
- `packages/business-logic/src/__tests__/dimension-cart-checkout.test.mjs`
- `packages/business-logic/src/__tests__/remote-cloud-ack-integrity.test.mjs`

The existing complete business-logic and coverage CI suites discover
both files without an additional pre-install test step. PR must remain
unmerged until all required exact-head checks pass.

## Next

1. Extend *the existing* `create_sale(JSONB,JSONB,BOOLEAN)` RPC to
   accept canonical `dimension_metadata` on initial sale-item INSERT,
   not post-sale UPDATE, with role/tenant/branch checks unchanged.
2. Ensure cloud writers and offline sync serializers map the same
   field in both directions, preserve immutable outbox evidence,
   detect legacy schema/protocol incompatibility, and safely replay.
3. Run full Windows/Online/Hybrid customer acceptance, stock,
   returns, reconciliation, invoice print and backup/restore before
   enabling the dimensional POS UI.
