\set ON_ERROR_STOP on
-- Isolated GitHub Actions PostgreSQL 17 fixture. Never point this at a remote DB.
-- The tenant-RLS harness has already seeded two organizations and four test users.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END;
$roles$;
CREATE TABLE IF NOT EXISTS public.branches (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  user_id UUID,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.branches TO authenticated;
INSERT INTO public.branches(id,org_id) VALUES
  ('c1000000-0000-4000-8000-000000000001','10000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-4000-8000-000000000002','20000000-0000-0000-0000-000000000002');
SELECT 'Isolated roster policy fixture ready' AS result;
