-- PostgreSQL UUID aggregate compatibility fix for tenant bootstrap helper.
-- Historical migration 20260916 used MIN(org_id), but PostgreSQL does not
-- provide min(uuid). Keep the old migration immutable and replace only the
-- helper definition here.

CREATE OR REPLACE FUNCTION private.current_user_org_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result UUID;
  org_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO org_count
    FROM public.organization_members
   WHERE user_id = auth.uid();

  SELECT org_id
    INTO result
    FROM public.organization_members
   WHERE user_id = auth.uid()
   ORDER BY org_id::text
   LIMIT 1;

  IF org_count = 0 OR result IS NULL THEN
    RAISE EXCEPTION 'No Minarva Biz organization is assigned to the signed-in user';
  END IF;

  IF org_count > 1 THEN
    RAISE EXCEPTION 'Multiple organizations are not supported by this client yet';
  END IF;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION private.current_user_org_id() IS
  'Returns the sole organization assigned to the authenticated Minarva Biz user without relying on unsupported UUID aggregates.';
