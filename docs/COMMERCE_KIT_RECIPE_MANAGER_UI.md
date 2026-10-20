# COM-003 — Seller Kit Recipe Manager (offline UI)

**Date:** 2026-10-21. Follows merged PR #558 (kit recipe domain), and is independent of PR #557's Cloudflare Pages build problem.

## Operator workflow

1. Products → **Manage kit recipe drafts**. The dialog provides a name, product rows, and quantities per kit.
2. Add/remove component rows (up to 100). An unused active company-wide SKU is the default for new rows; duplicates may still be chosen deliberately and are combined in the local domain.
3. **Save kit recipe draft**, or **Edit recipe** → **Save recipe changes**. Domain enforces `products.manage`, optimistic revision, active catalog SKUs and snapshot autosave. Editing is cancelled without mutation.
4. Saved local drafts list their composition count and revision; **Delete recipe** explicitly confirms before calling version-checked deletion.
5. Enter kit count and choose **Preview current price** for a saved recipe. Domain reads live catalog prices, aggregates repeated SKUs, computes an exact-cent estimated total and refuses inactive/foreign-branch products. Invalid count displays an error and removes stale preview.

`parseCommerceKitRecipeRows()` parses positive operator text quantities to exact integer milli-units. It refuses negative values, exponent notation, invalid quantities, more than three decimal places and unsafe ranges. Domain CRUD independently enforces the same stock and permission invariants.

## Explicit non-delivery

This provides a **locally saved composition draft**, not a saleable master SKU, customer-approved quotation, inventory reservation, price publication, checkout, journal mutation, invoice, outbox event or cloud sync. The application does **not** assume stock availability, nor does the preview grant a commercial price authority. Cloud account/build credentials are not changed.

Design inspiration: Aimeos bundles/kit composition; original Minarva TypeScript, no direct PHP, GPL or LGPL code. No migrations, new dependencies, production deployment or Windows release.

Evidence:
- `apps/web/src/app/(app)/products/kit-recipe-manager.tsx`
- `packages/business-logic/src/commerce-kit-recipe-input.ts`
- `packages/business-logic/src/__tests__/commerce-kit-recipe-manager.test.mjs`
- Existing `packages/business-logic/src/commerce-kit-recipes.ts` from merged #558

Ref #325. Future work: branch/tenant-approved persisted bundle masters, FEFO-aware atomic reservation/checkout, financial idempotency and cloud reconciliation.
