-- Warehouse-core FK index hardening batch 4.
-- Covers foreign-key join/delete checks flagged by Supabase performance advisor.
-- Target tables are currently empty in production, so regular CREATE INDEX is safe here.

CREATE INDEX IF NOT EXISTS idx_warehouse_locations_org_id
  ON public.warehouse_locations (org_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_org_id
  ON public.warehouse_stock (org_id);

CREATE INDEX IF NOT EXISTS idx_warehouses_branch_id
  ON public.warehouses (branch_id);
