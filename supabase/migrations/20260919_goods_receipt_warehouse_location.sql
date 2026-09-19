-- Minarva Biz WMS: link each goods-receipt line to the physical warehouse/bin
-- where the received quantity was placed. Nullable keeps non-WMS shops compatible.

ALTER TABLE public.goods_receipt_lines
  ADD COLUMN IF NOT EXISTS warehouse_location_id UUID
  REFERENCES public.warehouse_locations(id);

CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_warehouse_location
  ON public.goods_receipt_lines(warehouse_location_id)
  WHERE warehouse_location_id IS NOT NULL;
