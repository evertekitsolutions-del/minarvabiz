# INV-023 — Goods Receipt Landed Cost Allocation Preview

Date: 2026-10-21. Source inspirations: ERPNext Landed Cost Voucher, Odoo inventory landed costs, Dolibarr procurement expenses. Only common *business workflow concepts* used. All code is original Minarva Biz TypeScript, with no ERPNext/Dolibarr GPL or Odoo LGPL source copied or installed.

## Customer feature

Shared Web/Windows **Procurement → Landed cost allocation**. Select an existing authorized Goods Receipt (GRN), enter freight, insurance, customs duty and other additional costs, then preview charges distributed by original **receipt line value** or **received quantity**. Review allocated cost, estimated landed total and unit cost per line, with a UTF-8 CSV export. The original goods receipt line totals are the trusted baseline; the preview does not reconstruct costs from unrounded price×quantity.

Every expense is parsed to exact currency minor units. Charges are distributed by an integer **largest remainder** algorithm, stable by receipt-line ID when weighted amounts tie, so every cent is allocated once with no rounding leakage. Quantities use up to three decimal places. Consistency checks reject duplicate line IDs, mismatched receipt subtotal, foreign branch receipts, non-finite/negative/overprecision costs, zero-weight value-based allocation and unsupported quantities. The original source arrays and financial records are never modified.

### Important limitations and future acceptance

- This **does not post** landed cost into stock valuation, cost-of-goods-sold, supplier AP or general ledger. It is a **preview and CSV** for finance/warehouse review only.
- Goods Receipt does not preserve historical UOM conversion or weight/volume dimensions. Quantity-based allocation is only economically comparable when receipt items have compatible units; otherwise choose allocation by value.
- Landed cost classification by tax/duties, inventory capitalization, multi-currency exchange, ownership, accounting approval, cost revaluation after goods sold, reversal, audit, branch authorization, durable persistence and Offline/Hybrid sync must be implemented before treating INV-023 as complete.
- A source GRN with a null branch ID is retained for backward compatibility; full tenant-scoped authority is separate and **must not** rely on legacy null branches for security validation.

## Verification and rollout

- `node --test packages/business-logic/src/__tests__/landed-cost-preview.test.mjs`
- `pnpm --filter @minarvabiz/business-logic typecheck`
- `pnpm --filter @minarvabiz/ui typecheck`
- Exact-head GitHub Web/Windows CI, coverage, installed smoke, security and post-merge checks.

No runtime dependencies, paid APIs, production DB migration, release, external provider dependency or customer data writes introduced. Revert source PR to roll back. Do not claim the full INV-023 or full Master Vision completed because of this slice.
