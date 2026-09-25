-- Warehouse-transfer FK index hardening batch 5.
-- Covers the remaining foreign-key join/delete checks flagged by Supabase performance advisor.
-- The target table is currently empty in production, so regular CREATE INDEX is safe here.

CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_created_by
  ON public.warehouse_transfers (created_by);

CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_destination_location_id
  ON public.warehouse_transfers (destination_location_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_destination_warehouse_id
  ON public.warehouse_transfers (destination_warehouse_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_product_id
  ON public.warehouse_transfers (product_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_source_location_id
  ON public.warehouse_transfers (source_location_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_source_warehouse_id
  ON public.warehouse_transfers (source_warehouse_id);
