# COM-003 — Seller kit quote preview workflow

Minarva Commerce adds an operator-facing read-only kit price estimate based on a list of active, company-wide saleable catalog products. The underlying quote engine came from the preceding pure-domain kit pricing increment.

The operator can choose products, enter measured quantities per kit (at most 0.001 precision), enter an integer number of kits, then calculate a quote showing each component's quantity/retail unit price, the total across all kits, and an exact per-kit price only if representable in cents. Duplicate product rows are aggregated before rounding. Operator text inputs are validated in `parseCommerceKitQuoteDraft()`; invalid quantities/scientific notation/negative prices fail closed.

This preview does **not** save a bundle master, reserve stock, run FEFO selection, deduct stock, create a sale, apply B2B price tiers, issue a quote number, send an invoice or write any cloud/financial state. Use the existing read-only `preflightCommerceBundleStock()` separately for stock feasibility, and require transaction locks and an approved price authority before any commercial checkout.

This is an original Minarva TypeScript/UI implementation using Aimeos kits as design inspiration only. No copied GPL/LGPL source, new runtime dependency, hosted migration, production deployment or Windows release.

Tracker #325. Regression tests `commerce-kit-quote-draft.test.mjs` and existing `commerce-bundle-quote.test.mjs`.
