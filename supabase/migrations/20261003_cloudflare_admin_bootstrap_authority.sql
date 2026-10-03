-- Cloudflare-native first License Admin bootstrap authority.
-- This migration adds the replacement authority boundary without removing the
-- legacy server bootstrap yet. The legacy path is retired only after browser
-- bootstrap UX is verified end-to-end.

CREATE OR REPLACE FUNCTION public.cloudflare_admin_bootstrap_status(
  p_edge_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_hash TEXT;
  v_required BOOLEAN;
BEGIN
  IF p_edge_secret IS NULL
     OR char_length(p_edge_secret) < 32
     OR char_length(p_edge_secret) > 512 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'BOOTSTRAP_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  v_secret_hash := encode(extensions.digest(p_edge_secret, 'sha256'), 'hex');
  IF NOT EXISTS (
    SELECT 1
    FROM license_private.edge_credentials c
    WHERE c.active = true
      AND c.secret_sha256 = v_secret_hash
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'BOOTSTRAP_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  v_required := NOT EXISTS (
    SELECT 1
    FROM public.license_admin_identities
  );

  RETURN jsonb_build_object(
    'ok', true,
    'required', v_required,
    'httpStatus', 200
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_bootstrap_status(TEXT)
  FROM PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_bootstrap_status(TEXT)
  TO anon;


CREATE OR REPLACE FUNCTION public.cloudflare_admin_claim_first_admin(
  p_edge_secret TEXT,
  p_bootstrap_email TEXT,
  p_display_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_claims JSONB := auth.jwt();
  v_aal TEXT := COALESCE(v_claims ->> 'aal', '');
  v_jwt_email TEXT := lower(btrim(COALESCE(v_claims ->> 'email', '')));
  v_bootstrap_email TEXT := lower(btrim(COALESCE(p_bootstrap_email, '')));
  v_display_name TEXT := btrim(COALESCE(p_display_name, ''));
  v_secret_hash TEXT;
  v_auth_user RECORD;
BEGIN
  IF p_edge_secret IS NULL
     OR char_length(p_edge_secret) < 32
     OR char_length(p_edge_secret) > 512 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'BOOTSTRAP_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  v_secret_hash := encode(extensions.digest(p_edge_secret, 'sha256'), 'hex');
  IF NOT EXISTS (
    SELECT 1
    FROM license_private.edge_credentials c
    WHERE c.active = true
      AND c.secret_sha256 = v_secret_hash
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'BOOTSTRAP_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHENTICATED',
      'httpStatus', 401
    );
  END IF;

  IF v_aal <> 'aal2' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'MFA_REQUIRED',
      'httpStatus', 403
    );
  END IF;

  IF char_length(v_bootstrap_email) < 3
     OR char_length(v_bootstrap_email) > 254
     OR v_bootstrap_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR char_length(v_display_name) < 1
     OR char_length(v_display_name) > 120 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'BOOTSTRAP_NOT_CONFIGURED',
      'httpStatus', 503
    );
  END IF;

  IF v_jwt_email = '' OR v_jwt_email <> v_bootstrap_email THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'BOOTSTRAP_EMAIL_MISMATCH',
      'httpStatus', 403
    );
  END IF;

  SELECT
    u.id,
    lower(COALESCE(u.email, '')) AS email,
    u.email_confirmed_at,
    COALESCE(u.is_anonymous, false) AS is_anonymous
  INTO v_auth_user
  FROM auth.users u
  WHERE u.id = v_uid
  LIMIT 1;

  IF NOT FOUND
     OR v_auth_user.email <> v_bootstrap_email
     OR v_auth_user.email_confirmed_at IS NULL
     OR v_auth_user.is_anonymous = true THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'BOOTSTRAP_IDENTITY_NOT_VERIFIED',
      'httpStatus', 403
    );
  END IF;

  -- Serialize all first-admin claims so concurrent requests cannot create
  -- multiple administrators while the registry is empty.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('minarvabiz-license-admin-bootstrap-v1')
  );

  IF EXISTS (SELECT 1 FROM public.license_admin_identities) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'BOOTSTRAP_CLOSED',
      'httpStatus', 409
    );
  END IF;

  -- A customer/business identity is deliberately not promoted into the
  -- control-plane administrator role.
  IF EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = v_uid
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = v_uid
    ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'BOOTSTRAP_IDENTITY_IN_USE',
      'httpStatus', 409
    );
  END IF;

  INSERT INTO public.license_admin_identities (
    auth_user_id,
    email,
    display_name,
    status,
    role
  )
  VALUES (
    v_uid,
    v_bootstrap_email,
    v_display_name,
    'active',
    'admin'
  );

  INSERT INTO public.license_admin_audit_log (
    id,
    session_id,
    actor_id,
    actor_email,
    display_name,
    actor_role,
    source,
    action,
    outcome,
    target_type,
    target_id,
    details
  )
  VALUES (
    gen_random_uuid(),
    NULL,
    v_uid::TEXT,
    v_bootstrap_email,
    v_display_name,
    'admin',
    'supabase',
    'admin.bootstrap.claim',
    'success',
    'license_admin_identity',
    v_uid::TEXT,
    jsonb_build_object(
      'authority', 'cloudflare',
      'bootstrapVersion', 1
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'identity', jsonb_build_object(
      'id', v_uid,
      'email', v_bootstrap_email,
      'displayName', v_display_name,
      'role', 'admin'
    ),
    'httpStatus', 200
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'BOOTSTRAP_CLOSED',
      'httpStatus', 409
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'BOOTSTRAP_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_claim_first_admin(TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_claim_first_admin(TEXT, TEXT, TEXT)
  TO authenticated;
