# Open Mercato MIT reuse — GS1 EAN/UPC barcode assistant

**Date:** 2026-10-21. **Option A second source-adoption batch.**

## Source provenance

Catalog GTIN validation adapted directly from Open Mercato MIT Core:
https://github.com/open-mercato/open-mercato/blob/eb3193df03b9ce0b196be417fe265c1dc47c0868/packages/core/src/modules/catalog/lib/gtin.ts

Source adaptation: replace external `CatalogGtinType` type import with the equivalent local union; the checksum, normalization and validation algorithms are otherwise preserved as imported in `packages/business-logic/src/vendor/open-mercato/gtin.ts`. The Open Mercato copyright and MIT license grant/disclaimer are retained in `THIRD_PARTY_NOTICES.md`. No Enterprise code, external service or package dependency.

## Customer feature

Shared Web + Windows **Products & Inventory → EAN / UPC barcode check & check-digit generator**. The operator selects EAN-13, EAN-8 or UPC-A, enters an existing code or the body without final check digit. The module checks the GS1 Mod-10 check digit or generates the missing digit and clearly distinguishes these cases.

- EAN-13: 12-digit body, 13-digit complete.
- EAN-8: 7-digit body, 8-digit complete.
- UPC-A: 11-digit body, 12-digit complete.
- Letters, unknown types and incorrect lengths are rejected.
- Imported Open Mercato `normalizeGtinValue`, `computeGs1CheckDigit` and `isValidGtin` are used by the product-facing UI through a typed business-logic adapter.

**No GTIN ownership/uniqueness check:** passing a checksum or calculating a check digit does not confer rights to print a manufacturer/global identifier. Internal Code128 and QR workflows are unaffected. The assistant does not save a barcode, create catalog items, mutate inventory or authorize scanning.

## Tests and release

`node --test packages/business-logic/src/__tests__/gs1-barcode-assistant.test.mjs`
`pnpm --filter @minarvabiz/business-logic typecheck`
`pnpm --filter @minarvabiz/ui typecheck`

Exact-head Web/Windows CI, coverage, installed smoke, license/security gates before merge. No DB migration, license activation, paid infrastructure, production release, customer UAT or full ERP completion claim.
