-- Browser-native first License Admin signup reservation.
-- A public Supabase signup may request account_type=license_admin, but the
-- tenant-bootstrap trigger skips customer/org creation only when Cloudflare has
-- issued a short-lived, one-time reservation for the configured bootstrap email.

CREATE TABLE IF NOT EXISTS license_private.admin_bootstrap_signup_reservations (
  email TEXT PRIMARY KEY,
  token_sha256 TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_bootstrap_signup_reservations_email_valid
    CHECK (
      char_length(email) BETWEEN 3 AND 254
      AND email = lower(btrim(email))
      AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  CONSTRAINT admin_bootstrap_signup_reservations_token_sha256_valid
    CHECK (token_sha256 ~ '^[0-9a-f]{64}$')
);

REVOKE ALL ON TABLE license_private.admin_bootstrap_signup_reservations
  FROM PUBLIC, anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.cloudflare_admin_prepare_bootstrap_signup(
  p_edge_secret TEXT,
  p_bootstrap_email TEXT,
  p_token_sha256 TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_hash TEXT;
  v_email TEXT := lower(btrim(COALESCE(p_bootstrap_email, '')));
  v_token_sha256 TEXT := lower(btrim(COALESCE(p_token_sha256, '')));
  v_existing_user_id UUID;
  v_expires_at TIMESTAMPTZ := clock_timestamp() + interval '10 minutes';
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

  IF char_length(v_email) < 3
     OR char_length(v_email) > 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR v_token_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_REQUEST',
      'httpStatus', 400
    );
  END IF;

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

  SELECT u.id
  INTO v_existing_user_id
  FROM auth.users u
  WHERE lower(COALESCE(u.email, '')) = v_email
  ORDER BY u.created_at ASC
  LIMIT 1;

  IF FOUND THEN
    IF EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = v_existing_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = v_existing_user_id
      ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'BOOTSTRAP_IDENTITY_IN_USE',
        'httpStatus', 409
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'BOOTSTRAP_USER_EXISTS',
      'httpStatus', 409
    );
  END IF;

  DELETE FROM license_private.admin_bootstrap_signup_reservations r
  WHERE r.expires_at <= clock_timestamp();

  INSERT INTO license_private.admin_bootstrap_signup_reservations (
    email,
    token_sha256,
    expires_at,
    created_at
  )
  VALUES (
    v_email,
    v_token_sha256,
    v_expires_at,
    clock_timestamp()
  )
  ON CONFLICT (email) DO UPDATE
  SET
    token_sha256 = EXCLUDED.token_sha256,
    expires_at = EXCLUDED.expires_at,
    created_at = EXCLUDED.created_at;

  RETURN jsonb_build_object(
    'ok', true,
    'expiresAt', v_expires_at,
    'httpStatus', 200
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_prepare_bootstrap_signup(TEXT, TEXT, TEXT)
  FROM PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_prepare_bootstrap_signup(TEXT, TEXT, TEXT)
  TO anon;


CREATE OR REPLACE FUNCTION private.bootstrap_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  new_org_id UUID;
  display_name TEXT;
  shop_name TEXT;
  v_account_type TEXT;
  v_bootstrap_email TEXT;
  v_bootstrap_token TEXT;
  v_reserved_email TEXT;
BEGIN
  v_account_type := COALESCE(NEW.raw_user_meta_data ->> 'account_type', '');

  IF v_account_type = 'license_admin' THEN
    v_bootstrap_email := lower(btrim(COALESCE(NEW.email, '')));
    v_bootstrap_token := btrim(COALESCE(NEW.raw_user_meta_data ->> 'bootstrap_token', ''));

    IF char_length(v_bootstrap_email) BETWEEN 3 AND 254
       AND char_length(v_bootstrap_token) BETWEEN 32 AND 512 THEN
      DELETE FROM license_private.admin_bootstrap_signup_reservations r
      WHERE r.email = v_bootstrap_email
        AND r.expires_at > clock_timestamp()
        AND r.token_sha256 = encode(
          extensions.digest(v_bootstrap_token, 'sha256'),
          'hex'
        )
      RETURNING r.email INTO v_reserved_email;
    END IF;

    IF v_reserved_email IS NULL THEN
      RAISE EXCEPTION 'LICENSE_ADMIN_BOOTSTRAP_RESERVATION_REQUIRED'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
  END IF;

  display_name := NULLIF(COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''), '');
  IF display_name IS NULL THEN
    display_name := split_part(COALESCE(NEW.email, 'Minarva Biz User'), '@', 1);
  END IF;

  shop_name := NULLIF(COALESCE(NEW.raw_user_meta_data ->> 'shop_name', ''), '');
  IF shop_name IS NULL THEN
    shop_name := display_name || '''s Minarva Biz';
  END IF;

  INSERT INTO public.organizations (name)
  VALUES (shop_name)
  RETURNING id INTO new_org_id;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, display_name, 'admin')
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        updated_at = now();

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'admin')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  INSERT INTO public.branches (name, code, is_headquarters, is_active, org_id)
  VALUES ('Main Branch', 'HQ', true, true, new_org_id);

  RETURN NEW;
END;
$$;
