# UBP-05n — POS separate measured cuts for the same SKU

## Workflow

The existing POS product cards and barcode entry offer the shared
`DimensionRowEditor` for products explicitly stocked in `sqft` or
`sqm`. Instead of adding a default quantity of 1, the cashier enters
Length × Width × Pieces and applies an exact area preview.

Each measured cut has a unique `CartLine.cartLineId` row identity,
preserved across the existing held-sale JSON and React state. An
invoice may have several sale items with the **same productId** but
independent canonical `dimension-line-v1` metadata. These must never
be combined into a single unauditable quantity. Old ordinary cart
items without `cartLineId` still use `productId` as the row key.

The pure `appendPosMeasuredCut` helper rejects unsupported product
stock units, incompatible measurement units, malformed/reused row IDs,
forged previews and **cumulative** quantity exceeding live product
stock across earlier cuts. Checkout's authoritative live stock and
server atomic sale checks remain independent and unchanged.

Measured quantities are read-only after adding a cut. Discount and
removal target exactly the cart row rather than all sibling cuts.
Ordinary POS quantity inputs retain 0.001 quantity precision instead
of using integer-only parsing. Changing an ordinary row still checks
stock against the sum of the other cuts.

A sale Hold/Resume uses the existing `held.lines` transport, so the
optional `cartLineId` and metadata survive serialisation; the cloud
writer persists each cut as an independent sale item and retains the
measurement audit in its immutable `dimension_metadata`.

## Verification

`packages/business-logic/src/__tests__/pos-multi-cut-area-cart.test.mjs`
covers two different cuts of the same SKU, measured subtotal identity,
JSON hold/restore, immutable measurements, duplicate row identity,
precision drift, aggregated stock demand, editing/removal by stable
identity, and POS screen integration.

Test-first RED in CI confirmed the helper was absent before
implementation. Complete exact-head GitHub CI, coverage, desktop/web
type-checks, browser smoke and installed Windows smoke are mandatory
before merge.

## Release boundary

**Source only.** No hosted Supabase migration was deployed, no new
Windows customer installer was published, and dimensional billing has
not been enabled for paying customers. Older deployments lacking the
validated UBP-05c/05e/05g capability handshake still refuse remote
area-sale writes. No automatic financial outbox replay or paid
infrastructure added.
