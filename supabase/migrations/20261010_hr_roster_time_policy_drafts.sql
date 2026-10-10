-- HR-004C, slice 2: tenant-owned, audited DRAFT roster time policy.
--
-- IMPORTANT: This migration CANNOT activate enforcement. Draft-only SQL CHECK
-- prevents anyone (including privileged RPC) from representing an unverified
-- timezone/rest policy as approved or active before staff_roster_guard() is
-- upgraded and PostgreSQL RLS/UTC/rest migration E2E has passed.
--
-- Existing organization branches/shift templates/roster history are unchanged.
-- No new paid services, Supabase-only extensions or hidden "default timezone".
CREATE TABLE IF NOT EXISTS public.staff_roster_time_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  effective_from DATE NOT NULL CHECK (
    effective_from BETWEEN DATE '1900-01-01' AND DATE '9999-12-31'
  ),
  effective_until DATE,
  iana_zone TEXT NOT NULL,
  dst_gap_policy TEXT NOT NULL DEFAULT 'reject' CHECK (dst_gap_policy='reject'),
  dst_fold_policy TEXT NOT NULL DEFAULT 'reject' CHECK (
    dst_fold_policy IN ('reject','earlier','later')
  ),
  minimum_rest_minutes INTEGER NOT NULL DEFAULT 0 CHECK (
    minimum_rest_minutes BETWEEN 0 AND 10080
  ),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status='draft'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  updated_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT roster_policy_date_range CHECK (
    effective_until IS NULL OR effective_until >= effective_from
  ),
  CONSTRAINT roster_policy_natural_key UNIQUE (org_id,branch_id,effective_from)
);
CREATE INDEX IF NOT EXISTS idx_roster_policy_branch_period
  ON public.staff_roster_time_policies(org_id,branch_id,effective_from DESC);
ALTER TABLE public.staff_roster_time_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roster_time_policies FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_roster_time_policies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_roster_time_policies TO authenticated;
-- Standard service-only backup/administration privilege, not a browser grant.
-- CI's isolated PostgreSQL fixture defines the service_role role as in Supabase.
GRANT ALL ON public.staff_roster_time_policies TO service_role;
DROP POLICY IF EXISTS staff_roster_time_policies_manager_read
  ON public.staff_roster_time_policies;
CREATE POLICY staff_roster_time_policies_manager_read
  ON public.staff_roster_time_policies FOR SELECT TO authenticated
  USING (public.user_has_org_role(
    org_id, ARRAY['super_admin','admin','manager']::TEXT[]
  ));

-- Secondary integrity authority also protects privileged administrative DML.
CREATE OR REPLACE FUNCTION public.staff_roster_time_policy_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp AS $policy_guard$
BEGIN
  IF NEW.branch_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id=NEW.branch_id AND b.org_id=NEW.org_id AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Roster time policy branch belongs to another tenant or is archived'
      USING ERRCODE='23514';
  END IF;
  IF NEW.iana_zone IS NULL OR NEW.iana_zone <> pg_catalog.btrim(NEW.iana_zone)
    OR (NEW.iana_zone <> 'UTC' AND
        NEW.iana_zone !~ '^[A-Za-z][A-Za-z0-9_+.-]*(/[A-Za-z0-9_+.-]+)+$')
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=NEW.iana_zone
    ) THEN
    RAISE EXCEPTION 'Roster time policy needs an existing named IANA timezone'
      USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.org_id IS DISTINCT FROM OLD.org_id
      OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
      OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
      OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Roster policy tenant, branch and historical identity are immutable'
        USING ERRCODE='23514';
    END IF;
    IF NEW.version <> OLD.version+1 THEN
      RAISE EXCEPTION 'Roster policy optimistic revision conflict'
        USING ERRCODE='40001';
    END IF;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$policy_guard$;
REVOKE ALL ON FUNCTION public.staff_roster_time_policy_guard()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS staff_roster_time_policy_validate
  ON public.staff_roster_time_policies;
CREATE TRIGGER staff_roster_time_policy_validate
  BEFORE INSERT OR UPDATE ON public.staff_roster_time_policies
  FOR EACH ROW EXECUTE FUNCTION public.staff_roster_time_policy_guard();

-- No direct browser DML. Manager writes use explicit, audited, revisioned RPC.
-- This RPC saves DRAFTS ONLY; approval is impossible until a later additive
-- migration creates/validates server UTC overlap + rest enforcement.
CREATE OR REPLACE FUNCTION public.save_staff_roster_time_policy_draft(
  p_branch_id UUID,
  p_effective_from DATE,
  p_iana_zone TEXT,
  p_dst_fold_policy TEXT,
  p_minimum_rest_minutes INTEGER,
  p_expected_version INTEGER,
  p_effective_until DATE DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $policy_writer$
DECLARE
  authority RECORD;
  prior public.staff_roster_time_policies;
  saved public.staff_roster_time_policies;
  before_json JSONB := NULL;
  action_name TEXT;
BEGIN
  SELECT * INTO STRICT authority FROM public.current_user_authorization();
  IF authority.auth_role NOT IN ('super_admin','admin','manager') THEN
    RAISE EXCEPTION 'Roster policy manager permission denied'
      USING ERRCODE='42501';
  END IF;
  IF p_branch_id IS NULL
    OR p_iana_zone IS NULL OR p_iana_zone=''
    OR p_dst_fold_policy NOT IN ('reject','earlier','later')
    OR p_dst_fold_policy IS NULL
    OR p_minimum_rest_minutes IS NULL
    OR p_minimum_rest_minutes NOT BETWEEN 0 AND 10080
    OR p_expected_version IS NULL OR p_expected_version < 0
    OR p_expected_version = 2147483647
    OR p_effective_from IS NULL
    OR p_effective_from NOT BETWEEN DATE '1900-01-01' AND DATE '9999-12-31'
    OR (p_effective_until IS NOT NULL AND p_effective_until < p_effective_from) THEN
    RAISE EXCEPTION 'Invalid roster time policy draft input'
      USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id=p_branch_id AND b.org_id=authority.auth_org_id AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Policy branch is not a current branch of this organization'
      USING ERRCODE='42501';
  END IF;

  -- Two manager devices saving one draft must serialize, not lose revisions.
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
    authority.auth_org_id::TEXT||':'||p_branch_id::TEXT||':'||p_effective_from::TEXT,0));
  SELECT * INTO prior FROM public.staff_roster_time_policies
  WHERE org_id=authority.auth_org_id AND branch_id=p_branch_id
    AND effective_from=p_effective_from FOR UPDATE;
  IF FOUND THEN
    IF prior.version <> p_expected_version THEN
      RETURN pg_catalog.jsonb_build_object(
        'accepted',false,'remote',pg_catalog.to_jsonb(prior));
    END IF;
    before_json:=pg_catalog.to_jsonb(prior);
    UPDATE public.staff_roster_time_policies SET
      iana_zone=p_iana_zone,
      dst_fold_policy=p_dst_fold_policy,
      minimum_rest_minutes=p_minimum_rest_minutes,
      effective_until=p_effective_until,
      version=prior.version+1,
      updated_by=authority.auth_user_id
      WHERE id=prior.id
      RETURNING * INTO saved;
    action_name:='roster.time_policy.draft.update';
  ELSE
    IF p_expected_version<>0 THEN
      RETURN pg_catalog.jsonb_build_object('accepted',false,'remote',NULL);
    END IF;
    INSERT INTO public.staff_roster_time_policies(
      org_id,branch_id,effective_from,effective_until,iana_zone,
      dst_fold_policy,minimum_rest_minutes,created_by,updated_by
    ) VALUES (
      authority.auth_org_id,p_branch_id,p_effective_from,p_effective_until,
      p_iana_zone,p_dst_fold_policy,p_minimum_rest_minutes,
      authority.auth_user_id,authority.auth_user_id
    ) RETURNING * INTO saved;
    action_name:='roster.time_policy.draft.create';
  END IF;
  INSERT INTO public.audit_logs(
    org_id,user_id,action,table_name,record_id,old_value,new_value
  ) VALUES (
    authority.auth_org_id,authority.auth_user_id,
    action_name,'staff_roster_time_policies',saved.id,before_json,pg_catalog.to_jsonb(saved)
  );
  RETURN pg_catalog.jsonb_build_object('accepted',true,'record',pg_catalog.to_jsonb(saved));
END;
$policy_writer$;
REVOKE ALL ON FUNCTION public.save_staff_roster_time_policy_draft(
  UUID,DATE,TEXT,TEXT,INTEGER,INTEGER,DATE
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_staff_roster_time_policy_draft(
  UUID,DATE,TEXT,TEXT,INTEGER,INTEGER,DATE
) TO authenticated;
