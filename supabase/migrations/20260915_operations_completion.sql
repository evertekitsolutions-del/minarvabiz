-- Minarva Biz operations completion: roll-level material and production workflow persistence.
-- Idempotent so it is safe to apply after the core schema.

CREATE TABLE IF NOT EXISTS public.production_workflows (
  id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  rework_count INTEGER NOT NULL DEFAULT 0,
  events_json JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.production_stage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by UUID,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.material_rolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.products(id),
  batch_id TEXT,
  shade_code TEXT,
  width_meters NUMERIC(14,3),
  quantity_meters NUMERIC(14,3) NOT NULL,
  reserved_meters NUMERIC(14,3) NOT NULL DEFAULT 0,
  cost_per_meter NUMERIC(14,2) NOT NULL DEFAULT 0,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.material_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.products(id),
  planned_meters NUMERIC(14,3) NOT NULL DEFAULT 0,
  actual_meters NUMERIC(14,3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_production_workflows_stage ON public.production_workflows(stage);
CREATE INDEX IF NOT EXISTS idx_production_stage_events_order ON public.production_stage_events(order_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_rolls_material ON public.material_rolls(material_id, active);
CREATE INDEX IF NOT EXISTS idx_material_consumptions_material ON public.material_consumptions(material_id, created_at DESC);

ALTER TABLE public.production_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_stage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_rolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_consumptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS production_workflows_authenticated ON public.production_workflows;
DROP POLICY IF EXISTS production_stage_events_authenticated ON public.production_stage_events;
DROP POLICY IF EXISTS material_rolls_authenticated ON public.material_rolls;
DROP POLICY IF EXISTS material_consumptions_authenticated ON public.material_consumptions;

CREATE POLICY production_workflows_authenticated ON public.production_workflows
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY production_stage_events_authenticated ON public.production_stage_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY material_rolls_authenticated ON public.material_rolls
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY material_consumptions_authenticated ON public.material_consumptions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
