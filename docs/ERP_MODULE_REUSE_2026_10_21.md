# ERPNext / Odoo / Dolibarr reuse for Minarva Biz

Date: 2026-10-21. Product: proprietary TypeScript monorepo, Offline + Online + Hybrid.

## Licensing boundary

- [ERPNext](https://github.com/frappe/erpnext) — GPL-3.0; inspect behavior and standard workflows only unless a separately reviewed GPL-compliant standalone integration is approved.
- [Odoo Community](https://github.com/odoo/odoo) — LGPL-3.0 main tree; individual addons and bundled assets may have other license notices. Direct source reuse needs exact-file and dependency review.
- [Dolibarr](https://github.com/Dolibarr/dolibarr) — GPL-3.0; inspect behavior only, or use an explicitly separated integration after review.

**No source, assets or libraries from these three repositories were copied or included.** No added runtime dependencies or paid infrastructure. Review/reconsider the licensing boundary before introducing any external code.

## Feature adoption map

| Inspiration | Minarva capability | Delivery |
| --- | --- | --- |
| ERPNext Stock Reconciliation | INV-018 CSV count worksheet → physical variance preview | This PR: native shared TS, Web + Windows UI |
| Odoo Inventory reordering rules | INV-011/012 reorder point and replenishment proposal | Candidate; first compare with existing Minarva inventory intelligence |
| Odoo vendor pricelists | PUR procurement vendor quote and item-supplier comparison | Candidate, not shipped here |
| ERPNext asset depreciation | FIN-018 fixed-asset register and depreciation | Candidate, not shipped here |
| Dolibarr Interventions and Contracts | Service job visits, SLA, recurring AMC and technician follow-up | Candidate, not shipped here |
| Dolibarr Projects | Service work-order project costing | Candidate, not shipped here |

Do not mark a candidate complete merely because an upstream repository has a module. Implement incrementally against the live capability registry and avoid redoing merged features.

## INV-018 review (delivered by this PR)

1. Authorized inventory operator exports the existing branch-scoped worksheet.
2. Operator enters physical quantities (up to 0.001 unit precision) and optional notes.
3. **Review counted CSV** parses quoted/multiline fields and enforces matching headers, complete inventory IDs, unit/SKU/barcode, consistent snapshot time and original stock quantities against current authorized branch state.
4. Review shows counted/un-counted product totals and signed discrepancy quantities. Missing counts are not treated as zero.
5. No stock/ledger/outbox writes or migrations; the pre-existing Stock adjustment journey remains the only posting path.

Still needed for full INV-018: durable count sessions, stock snapshot/revision authority, scan counting, multi-user assignments, approval workflow, atomic audited adjustment, cloud/replay conflict handling, installed Web/Windows/Hybrid UAT. The CSV preview is explicitly partial and can reject aged sheets when live stock changes.

### Verification

Targeted test: `node --test packages/business-logic/src/__tests__/inventory-count-review.test.mjs`.

Package typecheck: `pnpm --filter @minarvabiz/business-logic typecheck`.

Shared UI typecheck: `pnpm --filter @minarvabiz/ui typecheck` (if defined), plus normal CI Web/Windows build checks.

No release, hosted migration, production writes or customer acceptance is claimed.
