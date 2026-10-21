# PUR-011 — Supplier Delivery Performance (initial source milestone)

**References:** Odoo purchase/inventory vendor performance workflow concepts and Dolibarr supplier order/receipt workflows. Both upstream sources are only used as functional inspiration; no third-party source, libraries, or assets were copied. Odoo Community is LGPLv3 and Dolibarr is GPLv3. Minarva remains proprietary.

## Customer-facing behavior

The existing shared **Procurement** screen now includes a supplier performance table for both Web and Windows.

- Included: non-deleted approved/partially received/received purchase orders and actual goods receipts.
- Excluded: draft, cancelled and archived purchase orders; archived supplier records.
- Displays approved and fully received PO count, equal-per-line receipt fulfillment percentage, on-time % for completed POs **with a known expected date**, count of overdue unfulfilled POs, and ordered PO value.
- A line's receipt quantity comes from its Goods Receipt rows, not the mutable cached receivedQuantity in a PO.
- Duplicate GRN identifiers do not inflate metrics; foreign supplier/branch receipts are ignored.
- Missing delivery dates generate no invented on-time rating. Different SKU quantities/units are not improperly summed into a single completion ratio.
- Read-only, no new dependencies, paid API, writes, hosted migrations or release. No automatic vendor ratings, payment/quality scoring or financial accounting changes.

This is **partial PUR-011**, not the full contract-vendor management or purchasing analytics suite. Next milestones: accepted returns/defect-quality measures, configurable SLA windows, historical order revision provenance, multi-company organization authority and authenticated customer UAT.

### Verification

`node --test packages/business-logic/src/__tests__/supplier-delivery-scorecard.test.mjs`

`pnpm --filter @minarvabiz/business-logic typecheck`

`pnpm --filter @minarvabiz/ui typecheck`

All required exact-head PR checks, post-merge main checks, Web/Windows UAT and licensed installer release remain separate gates.
