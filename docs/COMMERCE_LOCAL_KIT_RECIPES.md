# COM-003 — Local Kit Recipe Drafts (offline-first groundwork)

This increment implements seller-managed **composition drafts**, inspired by Aimeos kit/bundle behavior but written as original Minarva TypeScript. It does not install or copy PHP, GPL or LGPL code.

## Delivered

- `createCommerceKitRecipe`, `updateCommerceKitRecipe`, `deleteCommerceKitRecipe`, `listCommerceKitRecipes` support reusable, locally saved kit names and SKU quantities with exact milli-unit precision.
- Duplicate component SKUs are aggregated before saving; additions are checked with BigInt to stop quantity overflow. Drafts are restricted to currently active, company-wide saleable product leaves.
- `products.manage` RBAC and expected-version optimistic concurrency protect create/update/delete; changes have audit events and update autosave snapshots.
- `previewCommerceKitRecipe` always recalculates prices from **current** catalog selling prices and rejects deleted, disabled, foreign-branch or variant-parent products on use.
- Backups contain `commerceKitRecipes`, validated before any restore writes. Invalid price, customer-group, tenant, branch or publishing flags are rejected; missing legacy fields restore as an empty draft list to prevent cross-business leakage.
- Record and component counts are capped (500 recipes, 100 source component rows per recipe).
- Eight real-domain test groups cover lifecycle, live-price updates, stale revisions, permission, invalid quantities, malicious backup payloads, restore and retired products.

## Exclusions and gates

These are **local, unapproved drafts**. No bundle SKU master, reserved stock, FEFO transaction, online synchronization, customer checkout, tax allocation, journal, invoice or sales authority is implemented. Full kit release requires authoritative warehouse revalidation/atomic inventory and financial sync, signed tenant permissions and versioned commercial approval. Any future UI must keep that distinction visible.

No new dependency, live migration, Cloudflare or Vercel deployment, paid service or Windows installer release. Tracker #325; related prior PRs #553 (stock preflight), #556 (kit quote engine) and #557 (separate kit quote UI).
