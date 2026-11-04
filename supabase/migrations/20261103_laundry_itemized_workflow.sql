ALTER TABLE public.laundry_orders ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.laundry_orders ADD COLUMN IF NOT EXISTS pickup_at DATE;
ALTER TABLE public.laundry_orders ADD COLUMN IF NOT EXISTS due_at DATE;
