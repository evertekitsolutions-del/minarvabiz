# PUR-009 — Historical Supplier Purchase Price Comparison (initial slice)

2026-10-21. Sources inspected: [Odoo Community](https://github.com/odoo/odoo) supplier pricelist and [ERPNext](https://github.com/frappe/erpnext) buying/purchase price workflows. Concepts only, **no external source, assets, GPL/LGPL packages or paid service copied or installed**. Original Minarva shared TypeScript.

## Operator journey

Open the shared Web/Windows **Procurement** screen and choose a catalog product in **Supplier purchase price history**. Review per-supplier **last posted tax-exclusive invoice unit cost**, observed low/high price range, line count, dated invoice reference, and premium versus the cheapest last-recorded supplier price. Rows sorted by lowest recent unit cost.

Data is based on **posted, partially paid or paid invoices only**, not draft POs, draft invoices or live supplier quotes. Cancelled invoices, archived suppliers, unrelated product lines and mismatched branch identifiers are excluded. The active branch ID is taken from the existing host-controlled business state rather than a new user-entered tenant selector. Duplicate invoice IDs, invalid dates, unsafe unit costs and invalid quantities are rejected. Equal-date most-recent cost selection is deterministic.

## Limitations / remaining PUR-009

This is **historical purchase-cost intelligence**, **not** a signed vendor rate contract or approval to order from a supplier. It does not create purchase orders, mutate product costs or inventory, or bind the business to historical prices. Future contract milestones need a durable branch-authorized supplier agreement store, contract effective dates, currency, price break/quantity tier, tax and UOM conversions, price approval, immutable historical revisions, renewals, Offline/Hybrid sync conflict rules, signatures and customer UAT.

The current PurchaseInvoiceLine has no recorded historical UOM/currency fields. Thus the report uses the catalog product's current unit; users must verify historic unit equivalence before comparing negotiated prices. Zero-cost baseline does not invent a finite premium for a nonzero cost.

## Gates

Targeted: `node --test packages/business-logic/src/__tests__/supplier-posted-cost-comparison.test.mjs`.

`pnpm --filter @minarvabiz/business-logic typecheck` and `pnpm --filter @minarvabiz/ui typecheck`. Required exact-head PR CI and post-merge checks before declaring source acceptance.

No production migration, release, paid dependencies, customer data write, automated pricing authority or master-vision completion percentage change. Rollback: revert PR; original procurement workflow is unchanged.
