-- Cloudflare-native License Admin identity boundary.
-- Authenticated Supabase users must complete MFA (aal2) and exist in the
-- active license_admin_identities registry before any admin API can proceed.

CREATE OR REPLACE FUNCTION public.cloudflare_admin_me()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_claims JSONB := auth.jwt();
  v_aal TEXT := COALESCE(v_claims ->> 'aal', '');
  v_email TEXT := lower(COALESCE(v_claims ->> 'email', ''));
  v_identity RECORD;
  v_permissions JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  END IF;

  IF v_aal <> 'aal2' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MFA_REQUIRED');
  END IF;

  SELECT
    i.auth_user_id,
    i.email,
    i.display_name,
    i.status,
    i.role
  INTO v_identity
  FROM public.license_admin_identities i
  WHERE i.auth_user_id = v_uid
    AND i.status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_NOT_ALLOWED');
  END IF;

  IF v_email = '' OR lower(v_identity.email) <> v_email THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_IDENTITY_MISMATCH');
  END IF;

  IF v_identity.role = 'viewer' THEN
    v_permissions := jsonb_build_array(
      'license.read',
      'support.read'
    );
  ELSIF v_identity.role = 'operator' THEN
    v_permissions := jsonb_build_array(
      'license.read',
      'license.issue',
      'license.offline_activate',
      'customer.provision',
      'support.read',
      'support.manage'
    );
  ELSIF v_identity.role = 'admin' THEN
    v_permissions := jsonb_build_array(
      'license.read',
      'license.issue',
      'license.offline_activate',
      'license.status_manage',
      'customer.provision',
      'support.read',
      'support.manage'
    );
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_ROLE_INVALID');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'identity', jsonb_build_object(
      'id', v_identity.auth_user_id,
      'email', lower(v_identity.email),
      'displayName', v_identity.display_name,
      'role', v_identity.role
    ),
    'permissions', v_permissions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_me() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_me() TO authenticated;
