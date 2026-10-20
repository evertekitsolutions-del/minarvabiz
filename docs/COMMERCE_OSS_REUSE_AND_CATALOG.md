# Minarva Commerce — native shareable product catalog (2026-10-20)

## Compatibility decision
- **Open Mercato** ([upstream](https://github.com/open-mercato/open-mercato), MIT core): Next.js/TypeScript, multi-tenant extension and CRM design patterns can inform native modules. **Do not install a second MikroORM/DI/tenant authority** alongside Minarva's PostgreSQL/SQLite/sync.
- **Aimeos** ([upstream](https://github.com/aimeos/aimeos), MIT/LGPLv3 packages): product catalog, variants, B2B pricing and marketplace workflows are useful; its PHP/Laravel runtime and LGPL components must **not** be copied into Electron/Next.js commercial bundles without package-specific license review.
- **Uniqqer**: no verified canonical repository/release/license was identified; **not approved for dependency or source copying**. Reassess if a canonical URL is provided.
- **Imported third-party code:** none. This slice is original Minarva-native code; no new NPM/Composer dependencies or paid services.

## Implemented slice
- Products page: **Export shareable catalog CSV**, using the existing product store, categories and shop profile currency. Works in existing Web/Windows/Offline/Hybrid product UI without network.
- Read-only, deterministic filtering: active, non-deleted sellable SKUs/variants; exclude variant parent shells and optional other-branch products; preserve company-wide product visibility.
- Escapes formula-bearing CSV cells, quotes, commas and newlines; fails on invalid/non-cent monetary amounts/currency; never exports cost, supplier, stock counts, customer data, margin, internal notes or unpublished records.
- Explicit manual download only. **Not** an anonymous storefront endpoint, an ATP/stock promise, a customer-specific B2B price list, or a checkout/sync financial writer. Existing catalogue exporter with costs remains separate for authorized back-office use.

## Acceptance still required
- Confirm exact-head CI and Web/Windows product-page click test, including Excel UTF-8 and selected locale.
- Design audited catalog publication consent, storefront/SEO, tenant+branch authorization, customer price lists, images, inventory ATP/reservations, orders and immutable sales/financial sync. Do not expose a public catalog route or infer branch stock from globally cached values until these controls are proven.
- No migrations, production write or installer release in this PR. Whole-product acceptance remains historical ~51% provisional; this is a source-only delivery slice.

## Follow-up: offline customer HTML and branch-safe default
- Added self-contained **Download customer catalog HTML** with escaped text, strict CSP (no network, scripting, images or forms), print styles and honest availability disclaimer. Product page uses the current shop name/currency; no public URL or online publication.
- Fixed implicit branch-data exposure in CSV: when branch authority is unavailable, the default exports **company-wide products only**. Explicit authorized branch filtering is available at the pure-function boundary for future verified session usage, not presented as a self-selecting permission bypass in the UI.
- Both CSV/HTML use the same filtered projection and cent-safe selling prices. CSV export remains available. No migration, remote publishing or new library.
