# UBP-05k — dimensional refund and exchange integrity

## Risk addressed

The existing return quote calculator trusted a saved invoice line's
quantity and line value without checking its optional immutable
`dimension-line-v1` measurement packet. A changed dimension could
therefore produce a normal-looking credit for an invoice whose recorded
area no longer matched the original quantity.

## Boundary

`quoteSaleReturn` now uses the existing
`parseDimensionLineMetadata` (exact bigint measurement recomputation)
before quoting any dimensional line. It requires the saved quantity to
match integer thousandths exactly, refuses stale quantity, incorrect
piece count, changed length/width, extra metadata fields or unsupported
schema/algorithm versions. Unexpected snake_case alias data on a typed
sale item is rejected.

This is **read-only validation**. The existing
`createReturn`/`createExchange` paths call the same quote and already
refuse operations with quote errors before changing stock, customer
receivables, payment entries, or ledger journals. No new refund amount
formula, auto-restock policy, or invoice mutation is added.

**Valid partial-area refunds remain allowed** to the existing 0.001
sale-quantity precision, including repeated partial returns and existing
minor-unit cumulative rounding. Historic ordinary (non-dimensional)
invoices have unchanged behavior.

## Verification

`packages/business-logic/src/__tests__/dimension-return-audit-preflight.test.mjs`
covers exact area credit, prior-return caps, forged measurements and
precision drift. The test-first RED at commit `aecf802` confirmed that
forged `13 × 18` in measurements and `3.0004` original quantities were
incorrectly accepted before the source fix.

## Rollout

Source-only, no hosted migration or Windows installer publication.
Customer-facing dimensional POS activation and end-to-end return UI
validation are separate rollout gates. Existing legacy cloud replay
fail-closed protection stays in place.
