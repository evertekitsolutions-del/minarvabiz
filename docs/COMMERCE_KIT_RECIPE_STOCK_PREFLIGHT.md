# INV-017 — Versioned saved kit / warehouse stock preflight

2026-10-21 · Minarva-native TypeScript composition of existing `commerce-kit-recipes.ts` and `commerce-bundle-stock.ts`.

`preflightCommerceKitRecipeStock()` is a **read-only FEFO feasibility check** for a seller-local saved kit.

- Requires a saved recipe ID, **expected version**, trusted organization/warehouse IDs, business date, whole positive kit count and trusted warehouse-specific tracked-lot snapshot.
- Requires `products.manage` permission at the domain boundary. It rejects missing or concurrently edited recipes.
- Revalidates each *current* product in the recipe: no archived, disabled, foreign-branch or variant-parent products.
- Calls the existing multi-SKU FEFO allocator, which honors reservation, blocking and expiry and fails as a whole if any later SKU is short.
- Rejects unrelated, cross-org/warehouse or duplicate lot records; generates a frozen deterministic requirement list.
- Never mutates product, kit recipe, sales, stock, journal, outbox or remote cloud state. No backup shape, schema, paid dependency or deployment changes.

**Not a transaction:** This does not reserve stock, authorize warehouse reader scope, allocate serials, or commit a sale. Callers must verify the actual request's tenant and warehouse grants **before supplying lots**. The authoritative SQLite/Postgres checkout must reacquire locks, revalidate every SKU and idempotency state, then commit inventory + financial changes atomically. No UI workflow is created until trusted warehouse-scoped lot reads exist.

Tests: `packages/business-logic/src/__tests__/commerce-kit-recipe-stock.test.mjs` (six groups: successful FEFO, stale recipes, shortages, foreign lots, retired products, permission/invalid input).

References: prior kit drafts PR #558, stock planner #553, product UI PR #559; tracker #325. Aimeos kit behavior is a design reference only—no upstream GPL/LGPL implementation copied.
