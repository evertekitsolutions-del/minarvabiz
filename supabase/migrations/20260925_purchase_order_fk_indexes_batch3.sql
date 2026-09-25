-- Purchase-order FK index hardening batch 3.
-- Covers foreign-key join/delete checks flagged by Supabase performance advisor.
-- Target tables are currently empty in production, so regular CREATE INDEX is safe here.

CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_org_id
  ON public.purchase_order_lines (org_id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_approved_by
  ON public.purchase_orders (approved_by);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_branch_id
  ON public.purchase_orders (branch_id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_by
  ON public.purchase_orders (created_by);
