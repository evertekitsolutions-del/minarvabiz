# COM-003 — Read-only kit/bundle catalog pricing preview

Date: 2026-10-20. Follow-up to FEFO stock preflight PR #553.

This TypeScript domain function, `quoteCommerceBundle()`, allows a future seller-side bundle editor to calculate a deterministic, **nonbinding** price from live public product selling prices. It takes a count of physical kits, milli-unit component quantities, company-wide active products, and an explicit currency. Aimeos kit/bundle behavior is a design reference only, not copied implementation.

- A repeated SKU is aggregated before monetary multiplication, preventing repeated fractional rounding.
- All quantities are positive exact milli-units; kit count is a whole positive integer. BigInt intermediate quantities prevent silent overflow.
- Only active, non-deleted, company-wide saleable catalog leaves are eligible; cross-branch products, variant parent records, duplicate IDs and missing SKUs fail closed.
- Selling prices require exact cents. Per-SKU quantities and rounded line totals use shared minor-unit arithmetic; the final total is a safe sum of lines.
- `kitTotal` is an exact formatted cents string only when the overall total divides by the kit count without fractional cents; otherwise it is an empty string rather than presenting a falsely exact per-kit amount.
- The function never reads or changes stock, payments, products, outbox, invoices, taxes, customer data, licensing, or accounts. No new paid services or runtime dependencies.

**Not yet a saleable bundle SKU:** No kit composition persistence/editor, authoritative supplier costs, stock reservations, POS checkout, customer order, tax allocation, or cloud reconciliation. These require transactional locking/authorization and remain separate deliverables.

Regressions: `packages/business-logic/src/__tests__/commerce-bundle-quote.test.mjs`.

Tracker #325. No production migration, website deployment, or Windows release.
