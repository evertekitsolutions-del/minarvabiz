# UBP-05l — recorded area visibility in refund / exchange screen

The existing ReturnsPanel now displays the **original invoiced**
dimensional measurement next to each affected sale line and its
remaining return quantity. Example: `Recorded area: 12 in × 18 in ×
2 pcs = 3 sqft`. This uses the exact persisted `dimension-line-v1`
audit, not customer-editable return quantity, and the return form never
recomputes a competing monetary value.

Legacy sales without dimension metadata display exactly the same row
as before. Corrupted or incompatible invoice measurements display
`Invalid recorded area — refund blocked` without crashing the panel
or rendering untrusted HTML. The authoritative return quote preflight
from UBP-05k (already merged) independently rejects those records
before any financial stock, refund or journal mutation.

Only the readable display changes. No refund payment algorithm, stock
disposition, tenant permission, new input format or release flag is
modified.

Regression: `packages/business-logic/src/__tests__/dimension-return-visual-audit.test.mjs`.
TDD RED on head `de355ef` proved missing UI handling in the existing
component before the implementation.

Source-only. No hosted migration, Windows installer publication or
customer-facing dimensional POS enablement.
