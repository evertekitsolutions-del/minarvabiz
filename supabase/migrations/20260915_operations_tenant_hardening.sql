-- Tenant isolation for Phase 10 operations tables.
-- Existing rows remain readable only when their org_id belongs to the signed-in user's organizations.

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id
  FROM public.organization_members
  WHERE user_id = auth.uid()
  ORDER BY org_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_org_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_org_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;

ALTER TABLE public.production_workflows ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE public.production_stage_events ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE public.material_rolls ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE public.material_consumptions ADD COLUMN IF NOT EXISTS org_id UUID;

ALTER TABLE public.production_workflows ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.production_stage_events ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.material_rolls ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.material_consumptions ALTER COLUMN org_id SET DEFAULT public.current_org_id();

CREATE INDEX IF NOT EXISTS idx_production_workflows_org_id ON public.production_workflows(org_id);
CREATE INDEX IF NOT EXISTS idx_production_stage_events_org_id ON public.production_stage_events(org_id);
CREATE INDEX IF NOT EXISTS idx_material_rolls_org_id ON public.material_rolls(org_id);
CREATE INDEX IF NOT EXISTS idx_material_consumptions_org_id ON public.material_consumptions(org_id);

DROP POLICY IF EXISTS production_workflows_authenticated ON public.production_workflows;
DROP POLICY IF EXISTS production_stage_events_authenticated ON public.production_stage_events;
DROP POLICY IF EXISTS material_rolls_authenticated ON public.material_rolls;
DROP POLICY IF EXISTS material_consumptions_authenticated ON public.material_consumptions;

CREATE POLICY production_workflows_org_access ON public.production_workflows
  FOR ALL TO authenticated
  USING (org_id IS NOT NULL AND org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IS NOT NULL AND org_id IN (SELECT public.user_org_ids()));
CREATE POLICY production_stage_events_org_access ON public.production_stage_events
  FOR ALL TO authenticated
  USING (org_id IS NOT NULL AND org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IS NOT NULL AND org_id IN (SELECT public.user_org_ids()));
CREATE POLICY material_rolls_org_access ON public.material_rolls
  FOR ALL TO authenticated
  USING (org_id IS NOT NULL AND org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IS NOT NULL AND org_id IN (SELECT public.user_org_ids()));
CREATE POLICY material_consumptions_org_access ON public.material_consumptions
  FOR ALL TO authenticated
  USING (org_id IS NOT NULL AND org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IS NOT NULL AND org_id IN (SELECT public.user_org_ids()));
