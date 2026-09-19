-- Minarva Biz procurement/WMS integration.
-- Link each GRN line to the physical warehouse/bin where stock was placed.
-- Also add updated_at columns required by hybrid pull synchronization.

ALTER TABLE public.goods_receipts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.goods_receipt_lines
  ADD COLUMN IF NOT EXISTS warehouse_location_id UUID
  REFERENCES public.warehouse_locations(id);

ALTER TABLE public.goods_receipt_lines
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_warehouse_location
  ON public.goods_receipt_lines(warehouse_location_id)
  WHERE warehouse_location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_goods_receipts_updated_at
  ON public.goods_receipts(updated_at);

CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_updated_at
  ON public.goods_receipt_lines(updated_at);
