# COM-003 / SAL-014 groundwork — B2B tier pricing preview

**Reference:** Aimeos block/tier and customer-group prices; Open Mercato B2B offers and branch scope. This is **original TypeScript code**, not copied PHP or enterprise modules, and requires no new runtime/dependency.

`quoteCommerceTierPrice()` is a pure, offline-safe deterministic **nonbinding quote preview**:

- Validates money as exact cents and quantity with max 0.001 precision; uses integer minor units and deterministic line-rounding;
- Accepts product ID, regular selling price, quantity, currency, optional authoritative branch and customer-group scope;
- Picks group-specific first, then branch-specific, then highest eligible threshold within that scope;
- Rejects duplicate rule IDs, conflicting exact-scope thresholds, unsupported decimal money, negative/overflow amounts and invalid scope IDs;
- Does not read customer identity or roles on its own: caller must supply only verified scope, never a browser parameter;
- Does not change customer balances, SKU price, invoices, journals, discounts, stock, outbox, Supabase, or checkout.

**Not yet implemented:** Tier rule persistence/editor, seller approval, contract/version pinning, pricing authorization enforcement on order creation, invoices, POS, customer checkout, promotions and multi-currency conversions. Financial writers must never trust preview values without a newly verified authoritative rule snapshot. Full SAL-014/COM-003 completion is **not claimed**.

Tests: `packages/business-logic/src/__tests__/commerce-tier-pricing.test.mjs`.

No migrations, deployments, release installer, external PHP/LGPL/GPL code, paid infrastructure or hosted AI. Tracks #325 and `docs/COMMERCE_UPSTREAM_ADOPTION_MATRIX.md`.
