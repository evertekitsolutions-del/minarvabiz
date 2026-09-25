-- Procurement FK index hardening batch 2.
-- Covers foreign-key join/delete checks flagged by Supabase performance advisor.
-- Target tables are currently empty in production, so regular CREATE INDEX is safe here.

CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_org_id
  ON public.goods_receipt_lines (org_id);

CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_product_id
  ON public.goods_receipt_lines (product_id);

CREATE INDEX IF NOT EXISTS idx_goods_receipts_branch_id
  ON public.goods_receipts (branch_id);

CREATE INDEX IF NOT EXISTS idx_goods_receipts_created_by
  ON public.goods_receipts (created_by);

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_org_id
  ON public.purchase_invoice_lines (org_id);

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_product_id
  ON public.purchase_invoice_lines (product_id);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_branch_id
  ON public.purchase_invoices (branch_id);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_created_by
  ON public.purchase_invoices (created_by);
