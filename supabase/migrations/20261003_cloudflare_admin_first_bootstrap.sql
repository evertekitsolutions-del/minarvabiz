-- Cloudflare-native first License Admin bootstrap.
-- The configured first-admin email/name stay in encrypted Cloudflare bindings.
-- No Supabase service-role/secret key is required at the edge or browser.

CREATE OR REPLACE FUNCTION public.cloudflare_admin_bootstrap_status(
  p_edge_secret TEXT,
  p_expected_email TEXT,
  p_display_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_hash TEXT;
  v_email TEXT := lower(btrim(COALESCE(p_expected_email, '')));
  v_name TEXT := btrim(COALESCE(p_display_name, ''));
  v_user RECORD;
BEGIN
  IF p_edge_secret IS NULL OR char_length(p_edge_secret) < 32 OR char_length(p_edge_secret) > 512 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SERVICE_UNAVAILABLE', 'httpStatus', 503);
  END IF;

  v_secret_hash := encode(extensions.digest(p_edge_secret, 'sha256'), 'hex');
  IF NOT EXISTS (
    SELECT 1
    FROM license_private.edge_credentials c
    WHERE c.active = true
      AND c.secret_sha256 = v_secret_hash
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SERVICE_UNAVAILABLE', 'httpStatus', 503);
  END IF;

  IF char_length(v_email) < 3
     OR char_length(v_email) > 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR char_length(v_name) < 1
     OR char_length(v_name) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BOOTSTRAP_NOT_CONFIGURED', 'httpStatus', 503);
  END IF;

  IF EXISTS (SELECT 1 FROM public.license_admin_identities) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'available', false,
      'state', 'closed',
      'httpStatus', 200
    );
  END IF;

  SELECT u.id, u.raw_user_meta_data
  INTO v_user
  FROM auth.users u
  WHERE lower(u.email) = v_email
  ORDER BY u.created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'available', true,
      'state', 'new',
      'httpStatus', 200
    );
  END IF;

  IF COALESCE(v_user.raw_user_meta_data ->> 'account_type', '') <> 'license_admin' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'available', false,
      'state', 'account_conflict',
      'code', 'BOOTSTRAP_ACCOUNT_CONFLICT',
      'httpStatus', 200
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'available', true,
    'state', 'existing',
    'httpStatus', 200
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_bootstrap_status(TEXT, TEXT, TEXT)
  FROM PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_bootstrap_status(TEXT, TEXT, TEXT)
  TO anon;


CREATE OR REPLACE FUNCTION public.cloudflare_admin_bootstrap_start_guard(
  p_edge_secret TEXT,
  p_expected_email TEXT,
  p_display_name TEXT,
  p_client_ip TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status JSONB;
  v_email TEXT := lower(btrim(COALESCE(p_expected_email, '')));
  v_ip TEXT := left(btrim(COALESCE(p_client_ip, 'unknown')), 200);
  v_ip_hash TEXT;
  v_email_hash TEXT;
  v_rate RECORD;
  v_retry_after INTEGER;
BEGIN
  v_status := public.cloudflare_admin_bootstrap_status(
    p_edge_secret,
    p_expected_email,
    p_display_name
  );

  IF COALESCE((v_status ->> 'ok')::BOOLEAN, false) IS NOT TRUE
     OR COALESCE((v_status ->> 'available')::BOOLEAN, false) IS NOT TRUE THEN
    RETURN v_status;
  END IF;

  v_ip_hash := encode(extensions.digest(v_ip, 'sha256'), 'hex');
  v_email_hash := encode(extensions.digest(v_email, 'sha256'), 'hex');

  SELECT *
  INTO v_rate
  FROM public.consume_license_rate_limit(
    'admin-bootstrap-ip',
    v_ip_hash,
    5,
    3600
  );

  IF v_rate.allowed IS NOT TRUE THEN
    v_retry_after := GREATEST(
      1,
      ceil(extract(epoch FROM (v_rate.reset_at - clock_timestamp())))::INTEGER
    );
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'RATE_LIMITED',
      'retryAfterSeconds', v_retry_after,
      'httpStatus', 429
    );
  END IF;

  SELECT *
  INTO v_rate
  FROM public.consume_license_rate_limit(
    'admin-bootstrap-email',
    v_email_hash,
    3,
    3600
  );

  IF v_rate.allowed IS NOT TRUE THEN
    v_retry_after := GREATEST(
      1,
      ceil(extract(epoch FROM (v_rate.reset_at - clock_timestamp())))::INTEGER
    );
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'RATE_LIMITED',
      'retryAfterSeconds', v_retry_after,
      'httpStatus', 429
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'state', v_status ->> 'state',
    'httpStatus', 200
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_bootstrap_start_guard(TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_bootstrap_start_guard(TEXT, TEXT, TEXT, TEXT)
  TO anon;


CREATE OR REPLACE FUNCTION public.cloudflare_admin_finalize_bootstrap(
  p_edge_secret TEXT,
  p_expected_email TEXT,
  p_display_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_hash TEXT;
  v_uid UUID := auth.uid();
  v_jwt JSONB := auth.jwt();
  v_jwt_email TEXT := lower(btrim(COALESCE(auth.jwt() ->> 'email', '')));
  v_expected_email TEXT := lower(btrim(COALESCE(p_expected_email, '')));
  v_name TEXT := btrim(COALESCE(p_display_name, ''));
  v_user RECORD;
  v_existing RECORD;
BEGIN
  IF p_edge_secret IS NULL OR char_length(p_edge_secret) < 32 OR char_length(p_edge_secret) > 512 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SERVICE_UNAVAILABLE', 'httpStatus', 503);
  END IF;

  v_secret_hash := encode(extensions.digest(p_edge_secret, 'sha256'), 'hex');
  IF NOT EXISTS (
    SELECT 1
    FROM license_private.edge_credentials c
    WHERE c.active = true
      AND c.secret_sha256 = v_secret_hash
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SERVICE_UNAVAILABLE', 'httpStatus', 503);
  END IF;

  IF v_uid IS NULL OR v_jwt_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'httpStatus', 401);
  END IF;

  IF char_length(v_expected_email) < 3
     OR char_length(v_expected_email) > 254
     OR v_expected_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR char_length(v_name) < 1
     OR char_length(v_name) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BOOTSTRAP_NOT_CONFIGURED', 'httpStatus', 503);
  END IF;

  IF v_jwt_email <> v_expected_email THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BOOTSTRAP_NOT_ALLOWED', 'httpStatus', 403);
  END IF;

  SELECT
    u.id,
    lower(COALESCE(u.email, '')) AS email,
    u.email_confirmed_at,
    u.raw_user_meta_data
  INTO v_user
  FROM auth.users u
  WHERE u.id = v_uid
  LIMIT 1;

  IF NOT FOUND
     OR v_user.email <> v_expected_email
     OR v_user.email_confirmed_at IS NULL
     OR COALESCE(v_user.raw_user_meta_data ->> 'account_type', '') <> 'license_admin' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BOOTSTRAP_NOT_ALLOWED', 'httpStatus', 403);
  END IF;

  SELECT
    i.auth_user_id,
    i.email,
    i.display_name,
    i.status,
    i.role
  INTO v_existing
  FROM public.license_admin_identities i
  WHERE i.auth_user_id = v_uid
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.status = 'active'
       AND v_existing.role = 'admin'
       AND lower(v_existing.email) = v_expected_email THEN
      RETURN jsonb_build_object(
        'ok', true,
        'status', 'already_active',
        'httpStatus', 200
      );
    END IF;

    RETURN jsonb_build_object('ok', false, 'code', 'BOOTSTRAP_CLOSED', 'httpStatus', 409);
  END IF;

  IF EXISTS (SELECT 1 FROM public.license_admin_identities) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BOOTSTRAP_CLOSED', 'httpStatus', 409);
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
    v_expected_email,
    v_name,
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
    v_expected_email,
    v_name,
    'admin',
    'supabase',
    'admin.bootstrap.first',
    'success',
    'license_admin_identity',
    v_uid::TEXT,
    jsonb_build_object(
      'authority', 'cloudflare',
      'aal', COALESCE(v_jwt ->> 'aal', 'unknown')
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'created',
    'httpStatus', 200
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BOOTSTRAP_CLOSED', 'httpStatus', 409);
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE',
      'httpStatus', 503
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_finalize_bootstrap(TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_finalize_bootstrap(TEXT, TEXT, TEXT)
  TO authenticated;
