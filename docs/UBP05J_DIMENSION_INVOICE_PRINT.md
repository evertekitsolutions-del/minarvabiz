# UBP-05j — measured area on sale invoice print

A dimensional invoice already has an immutable `dimension-line-v1`
audit packet saved with each area-based sale item. The existing
`buildSaleInvoiceHtml` now renders this audit as a subordinate item
line on both A4 and thermal invoices:

**Area: 12 in × 18 in × 2 pcs = 3 sqft**

The renderer recomputes the quantity using the same UBP-05a/05b exact
calculator before displaying it. If a sale item has corrupt, forged or
unsupported area metadata, rendering refuses the invoice rather than
printing financially misleading dimensions. The sale itself remains
saved; failed printing never repeats the sale or payment transaction.

Customer/product text and measurement details remain HTML-escaped.
Legacy sale items with no dimensional metadata render identically
to the previous printer. The existing invoice template controls,
tax, payment, branding and thermal width remain unchanged.

Regression: `packages/business-logic/src/__tests__/dimension-invoice-audit-print.test.mjs`
tests A4, thermal, stored quantity, invalid audit packets and legacy
compatibility. TDD RED was observed on the preceding commit when the
invoice contained no 12 in measurement.

**No hosted Supabase migration, customer POS activation, Windows
installer release or automatic financial replay is included.**
The code becomes relevant to customers only after separate end-to-end
area billing acceptance and controlled rollout.
