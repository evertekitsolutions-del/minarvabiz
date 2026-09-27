-- Authoritative organization RBAC hardening.
-- Direct client role/membership mutation is prohibited; authenticated clients
-- resolve their own role via a SECURITY INVOKER function, while controlled role
-- changes go through a privilege-checked SECURITY DEFINER RPC.

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_members_self_insert ON public.organization_members;
DROP POLICY IF EXISTS organization_members_self_update ON public.organization_members;
DROP POLICY IF EXISTS organization_members_self_delete ON public.organization_members;
DROP POLICY IF EXISTS organization_members_member_write ON public.organization_members;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.organization_members FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.organization_members'::regclass
      AND conname = 'organization_members_role_allowed'
  ) THEN
    ALTER TABLE public.organization_members
      ADD CONSTRAINT organization_members_role_allowed
      CHECK (role IN ('super_admin','admin','manager','cashier','tailor','staff'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.current_user_authorization()
RETURNS TABLE (
  auth_user_id UUID,
  auth_org_id UUID,
  auth_role TEXT,
  auth_full_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  membership_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)
    INTO membership_count
    FROM public.organization_members om
   WHERE om.user_id = auth.uid();

  IF membership_count <> 1 THEN
    RAISE EXCEPTION 'Exactly one Minarva Biz organization membership is required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    om.user_id,
    om.org_id,
    om.role,
    COALESCE(NULLIF(p.full_name, ''), 'Minarva Biz User')
  FROM public.organization_members om
  LEFT JOIN public.profiles p ON p.id = om.user_id
  WHERE om.user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_authorization() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_authorization() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_organization_member_role(
  target_user_id UUID,
  new_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id UUID := auth.uid();
  caller_org_id UUID;
  caller_role TEXT;
  caller_membership_count INTEGER;
  target_role TEXT;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF new_role NOT IN ('super_admin','admin','manager','cashier','tailor','staff') THEN
    RAISE EXCEPTION 'Invalid Minarva Biz role' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*), MIN(om.org_id), MIN(om.role)
    INTO caller_membership_count, caller_org_id, caller_role
    FROM public.organization_members om
   WHERE om.user_id = caller_id;

  IF caller_membership_count <> 1 OR caller_org_id IS NULL THEN
    RAISE EXCEPTION 'Exactly one organization membership is required'
      USING ERRCODE = '42501';
  END IF;

  IF caller_role NOT IN ('super_admin','admin') THEN
    RAISE EXCEPTION 'Role management requires admin privileges'
      USING ERRCODE = '42501';
  END IF;

  IF target_user_id = caller_id THEN
    RAISE EXCEPTION 'Users cannot change their own organization role'
      USING ERRCODE = '42501';
  END IF;

  SELECT om.role
    INTO target_role
    FROM public.organization_members om
   WHERE om.org_id = caller_org_id
     AND om.user_id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a member of this organization'
      USING ERRCODE = '22023';
  END IF;

  IF caller_role <> 'super_admin'
     AND (new_role = 'super_admin' OR target_role = 'super_admin') THEN
    RAISE EXCEPTION 'Only a super admin may grant or modify the super admin role'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.organization_members
     SET role = new_role
   WHERE org_id = caller_org_id
     AND user_id = target_user_id;

  UPDATE public.profiles
     SET role = new_role,
         updated_at = now()
   WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_organization_member_role(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_organization_member_role(UUID, TEXT) TO authenticated;
