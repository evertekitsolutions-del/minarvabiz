# COM-003 — Manual customer-facing kit estimate CSV export

Sellers can export a **nonbinding draft kit estimate** from Products → Manage kit recipe drafts → Download estimate CSV.

- Only saved, version-checked local recipes may be exported; operator needs `products.manage` and selects a positive whole kit count.
- Live active company-wide catalog product prices are re-read for each download. SKU quantities are aggregated through the already-tested kit pricing engine. Exact cents are retained; the per-kit amount is blank unless representable exactly.
- Output includes the shop name, recipe name, public SKU/product names, quantities, units, currency, unit retail prices and estimated totals. Explicitly states `NONBINDING - NOT AN INVOICE`. It never serializes purchase cost, supplier data, stock quantities, internal notes, customer data or financial journals.
- Spreadsheet-formula injection in product names, kit names and merchant names is neutralized. CSV quotes, commas and newlines are escaped.
- This is a deliberate client-side download, not a public endpoint, email, message, invoice, quote number, checkout or publication of a tariff.
- No database migration, hosted dependency, new package, production deployment or Windows installer release.

Tests: `packages/business-logic/src/__tests__/commerce-kit-estimate-csv.test.mjs`. This uses the existing pure `previewCommerceKitRecipe()` and does **not** grant stock, reservation, customer-price or financial authority. Tracks #325 and COM-003.
