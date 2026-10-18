# UBP-05o — Normal Billing multi-cut area quantity

The Normal Billing editor can now append two or more independently measured
cuts of the same product (`sqft` or `sqm`) to a single cart and sale.

Each area measurement is approved using the existing exact bigint calculator,
then persisted in its own `CartLine.cartLineId` and immutable
`dimension-line-v1` audit packet. The cart can also contain an ordinary
non-dimensional row for the same product; only ordinary repeated additions
aggregate into an ordinary row.

Every append and ordinary quantity edit validates the **sum** of all sibling
line quantities against the product's shared stock, in exact thousandths.
Invalid quantity precision, altered metadata, duplicate or empty row identity,
or cumulative overstock is rejected before the cart changes. The existing
authoritative sale posting and online dimensional capability requirements are
not weakened.

Rate editing and removal target the exact cart row identity (not productId).
Measured quantity remains read-only, so the user must remove and remeasure
a cut rather than change quantity independently of its audit. A second cut
cannot overwrite a sibling cut's price, item audit or invoice line.

Regression suite:
`packages/business-logic/src/__tests__/normal-multi-cut-area-cart.test.mjs`.
Tests include two measured cuts of one product, independent sale-item IDs and
financial amount computation, hold JSON roundtrip, cross-cut stock validation,
forged metadata rejection, ordinary SKU aggregation, and exact per-row edits.

TDD: the first commit `fdc17ed` failed the desktop suite because multiple
cuts were prohibited, update/removal helpers were missing, and the UI used
product IDs as the only row key. Subsequent source changes address those
failures; exact-head CI is mandatory before merge.

**Deployment boundary:** no hosted Supabase migration, customer installer
publication, paid infrastructure or automatic replay of financial events.
Cloud writes still require the server-attested UBP-05c/e/g atomic RPC; local
customer acceptance across Windows offline, online and hybrid modes remains
a separate gate.
