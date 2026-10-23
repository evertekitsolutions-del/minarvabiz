# Minarva Commerce — native shareable product catalog (2026-10-20)

## Compatibility decision
- **Open Mercato** ([upstream](https://github.com/open-mercato/open-mercato), MIT TypeScript core): approved direct pure-code donor, pin `v0.9.0` / `4374c48def1654927805c4b760f0e7f8648280f2` pending revalidation for each new adoption. Exclude commercial enterprise, enterprise specs and unlicensed eslint-plugin-ds. Keep MIT notices and exact source provenance in `docs/DEPENDENCY_REUSE_LOG.md`. **Do not install a second MikroORM/DI/tenant authority** alongside Minarva's PostgreSQL/SQLite/sync.
- **Aimeos** ([aimeos-core](https://github.com/aimeos/aimeos-core), LGPL-3.0-or-later): PHP/Laravel; behaviour reference only for catalog, variants, quantity/customer-group pricing, checkout, delivery, payments, B2B, marketplace, SEO, JSON:API. No copied source or bundled PHP. Separately hosted adapter requires owner approval.
- **QUIQQER** ([owner-confirmed upstream](https://github.com/QUIQQER/core), GPL-3.0-or-later core; custom QEL/proprietary modules): this is the previously misspelled “Uniqqer”. Behaviour reference only for product/tax/currency/order/invoice/payment/shipping/discount workflows. Never copy code, identifiers, templates or text; implement independently in TypeScript.
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

## Feature-first acceptance order (owner decision 2026-10-20)

Keep existing customer catalog CSV/HTML and fail-closed company-vs-branch export filters. Next B-COMMERCE slices must prove audited publication consent, tenant/company/branch authorization, price lists, images, ATP and reservations, order capture and immutable sale/financial sync. Implement with one Minarva customer/invoice/stock/ledger authority. The new queue is documented in `docs/OWNER_DIRECTIVE_2026-10-20.md`; no automatic hosted catalog, paid service or production change is approved. Candidate donors: pure MIT Open Mercato checkout/shipping/customer/accounts/forms; Aimeos and QUIQQER remain behaviour-only. Record exact provenance in `docs/DEPENDENCY_REUSE_LOG.md`.
