# UBP-05m — Area measurement in Normal Billing

## Scope

Connects the existing `DimensionRowEditor` to the standard Normal Billing
screen. Only products whose stock unit is explicitly `sqft` or `sqm`
offer area measurement. The operator enters length, width, individual
length units, pieces and billable area unit, reviews the exact quantity
preview, and selects **Apply quantity** before adding the sale line.

The UI converts the preview into an immutable, versioned measurement
audit with the shared bigint calculator. The resulting cart row's
quantity is read-only, preventing later manual edits from separating
stock quantity from measured area. Editing the measurement invalidates
the prior approval and requires re-application. Switching products
clears the draft/approval; regular numeric billing remains unchanged.

Area sales are refused when the selected product is stocked in ordinary
pieces/metres or when the chosen area unit conflicts with the product's
stock unit. Stock availability is checked using the measured billable
quantity before the cart row is added.

The existing Normal Billing cart permits **one row per product**.
Consequently a second cut of the same SKU cannot be silently merged
into the first cut's audit. This milestone explicitly refuses that
action. Multiple distinct cut sizes for one SKU require a future
separate-row design and acceptance tests, not untracked summation.

## Verification

`packages/business-logic/src/__tests__/normal-area-billing-integration.test.mjs`
tests exact metadata, stock unit/quantity compatibility, missing/edited
preview rejection, duplicate-cut refusal, unchanged ordinary quantity
aggregation, and the real Normal Billing UI wiring. The initial RED
commit `61939a5` failed because the helper did not yet exist.

Full CI, web UI/browser, Windows smoke, secret scan, coverage and
release audit must pass on the final head before merge.

## Rollout

Source only. A server without the UBP-05c/e/g migration still refuses
dimensional cloud sale writes; it must never fall back to a legacy
direct-table writer or falsely acknowledge a financial batch.
No hosted Supabase migration or installer release is performed here.
