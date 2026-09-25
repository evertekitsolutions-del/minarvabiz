-- Correct production drift where the legacy sale_returns relation was never created.
-- Historical migrations are intentionally left unchanged. This migration brings
-- sale_returns directly to the current tenant/RBAC posture and is safe on fresh
-- installs where 0025_create_sale_returns.sql and 003_tenant_rls.sql already ran.

CREATE TABLE IF NOT EXISTS public.sale_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id)
);

ALTER TABLE public.sale_returns
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_sale_returns_org_id
  ON public.sale_returns(org_id);

ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_current_user_org_id ON public.sale_returns;
CREATE TRIGGER set_current_user_org_id
BEFORE INSERT ON public.sale_returns
FOR EACH ROW
EXECUTE FUNCTION private.set_current_user_org_id();

DROP POLICY IF EXISTS sale_returns_org_access ON public.sale_returns;
DROP POLICY IF EXISTS sale_returns_org_select ON public.sale_returns;
DROP POLICY IF EXISTS sale_returns_org_write ON public.sale_returns;
DROP POLICY IF EXISTS sale_returns_tenant_select ON public.sale_returns;
DROP POLICY IF EXISTS sale_returns_role_insert ON public.sale_returns;
DROP POLICY IF EXISTS sale_returns_role_update ON public.sale_returns;
DROP POLICY IF EXISTS sale_returns_role_delete ON public.sale_returns;

CREATE POLICY sale_returns_tenant_select ON public.sale_returns
  FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.org_id = sale_returns.org_id
        AND om.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY sale_returns_role_insert ON public.sale_returns
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IS NOT NULL
    AND public.user_has_org_role(
      sale_returns.org_id,
      ARRAY['super_admin','admin','manager']::text[]
    )
  );

CREATE POLICY sale_returns_role_update ON public.sale_returns
  FOR UPDATE TO authenticated
  USING (
    org_id IS NOT NULL
    AND public.user_has_org_role(
      sale_returns.org_id,
      ARRAY['super_admin','admin','manager']::text[]
    )
  )
  WITH CHECK (
    org_id IS NOT NULL
    AND public.user_has_org_role(
      sale_returns.org_id,
      ARRAY['super_admin','admin','manager']::text[]
    )
  );

CREATE POLICY sale_returns_role_delete ON public.sale_returns
  FOR DELETE TO authenticated
  USING (
    org_id IS NOT NULL
    AND public.user_has_org_role(
      sale_returns.org_id,
      ARRAY['super_admin','admin','manager']::text[]
    )
  );

-- Supabase no longer guarantees automatic Data API grants for newly created
-- tables. Make intended access explicit and keep unauthenticated callers out.
REVOKE ALL ON TABLE public.sale_returns FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sale_returns TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.sale_returns TO service_role;

COMMENT ON TABLE public.sale_returns IS
  'Legacy sale-return compatibility relation with tenant isolation and role-scoped writes.';
