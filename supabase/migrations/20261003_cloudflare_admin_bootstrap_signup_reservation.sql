-- Cloudflare-controlled first License Admin signup reservation.
--
-- Security model:
-- 1. Cloudflare receives the requested bootstrap email and calls the reservation
--    RPC with LICENSE_EDGE_RPC_SECRET plus a random one-time token digest.
-- 2. The RPC rate-limits by client IP, verifies the configured bootstrap email,
--    serializes first-admin setup, and refuses to rotate an active reservation.
-- 3. Cloudflare keeps the raw one-time token private and creates the Supabase
--    Auth user with a cryptographically random password that is never returned
--    to the browser.
-- 4. A BEFORE INSERT auth.users guard consumes the reservation, strips the
--    transient routing token/account type, and stamps server-controlled app
--    metadata.
-- 5. The existing AFTER INSERT tenant bootstrap skips customer/org creation only
--    for that server-stamped marker.
-- 6. Email confirmation + mailbox-owned password recovery establish credential
--    ownership. TOTP AAL2 + the PR #228 Cloudflare claim remain the actual
--    License Admin authorization boundary.

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
  p_requested_email TEXT,
  p_token_sha256 TEXT,
  p_client_ip TEXT DEFAULT 'unknown'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_secret_hash TEXT;
  v_bootstrap_email TEXT := lower(btrim(COALESCE(p_bootstrap_email, '')));
  v_requested_email TEXT := lower(btrim(COALESCE(p_requested_email, '')));
  v_token_sha256 TEXT := lower(btrim(COALESCE(p_token_sha256, '')));
  v_client_ip TEXT := left(btrim(COALESCE(p_client_ip, 'unknown')), 200);
  v_ip_hash TEXT;
  v_rate RECORD;
  v_retry_after INTEGER;
  v_existing_user_id UUID;
  v_existing_reservation_expires_at TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ := v_now + interval '10 minutes';
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

  IF char_length(v_bootstrap_email) < 3
     OR char_length(v_bootstrap_email) > 254
     OR v_bootstrap_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR char_length(v_requested_email) < 3
     OR char_length(v_requested_email) > 254
     OR v_requested_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR v_token_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_REQUEST',
      'httpStatus', 400
    );
  END IF;

  v_ip_hash := encode(
    extensions.digest(
      COALESCE(NULLIF(v_client_ip, ''), 'unknown') || '|' || v_secret_hash,
      'sha256'
    ),
    'hex'
  );

  SELECT *
  INTO v_rate
  FROM public.consume_license_rate_limit(
    'bootstrap-signup-reservation-ip',
    v_ip_hash,
    5,
    15 * 60
  );

  IF NOT COALESCE(v_rate.allowed, false) THEN
    v_retry_after := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (v_rate.reset_at - v_now)))::INTEGER
    );
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'RATE_LIMITED',
      'httpStatus', 429,
      'retryAfterSeconds', v_retry_after
    );
  END IF;

  -- Rate-limit before this comparison so wrong-email probes consume the same
  -- persistent budget as correct-email requests.
  IF v_requested_email <> v_bootstrap_email THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'BOOTSTRAP_SIGNUP_NOT_ALLOWED',
      'httpStatus', 403
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
  WHERE lower(COALESCE(u.email, '')) = v_bootstrap_email
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
  WHERE r.expires_at <= v_now;

  SELECT r.expires_at
  INTO v_existing_reservation_expires_at
  FROM license_private.admin_bootstrap_signup_reservations r
  WHERE r.email = v_bootstrap_email
    AND r.expires_at > v_now
  LIMIT 1;

  IF FOUND THEN
    v_retry_after := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (v_existing_reservation_expires_at - v_now)))::INTEGER
    );
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'BOOTSTRAP_RESERVATION_ACTIVE',
      'httpStatus', 409,
      'retryAfterSeconds', v_retry_after
    );
  END IF;

  INSERT INTO license_private.admin_bootstrap_signup_reservations (
    email,
    token_sha256,
    expires_at,
    created_at
  )
  VALUES (
    v_bootstrap_email,
    v_token_sha256,
    v_expires_at,
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'expiresAt', v_expires_at,
    'httpStatus', 200
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'BOOTSTRAP_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_prepare_bootstrap_signup(TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_prepare_bootstrap_signup(TEXT, TEXT, TEXT, TEXT, TEXT)
  TO anon;


CREATE OR REPLACE FUNCTION private.guard_license_admin_bootstrap_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_type TEXT := btrim(COALESCE(NEW.raw_user_meta_data ->> 'account_type', ''));
  v_email TEXT := lower(btrim(COALESCE(NEW.email, '')));
  v_bootstrap_token TEXT := btrim(COALESCE(NEW.raw_user_meta_data ->> 'bootstrap_token', ''));
  v_reserved_email TEXT;
BEGIN
  DELETE FROM license_private.admin_bootstrap_signup_reservations r
  WHERE r.expires_at <= clock_timestamp();

  IF v_account_type = 'license_admin' THEN
    -- The registry may have closed after the reservation was prepared.
    IF EXISTS (SELECT 1 FROM public.license_admin_identities) THEN
      RAISE EXCEPTION 'LICENSE_ADMIN_BOOTSTRAP_CLOSED'
        USING ERRCODE = 'P0001';
    END IF;

    IF char_length(v_email) BETWEEN 3 AND 254
       AND char_length(v_bootstrap_token) BETWEEN 32 AND 512 THEN
      DELETE FROM license_private.admin_bootstrap_signup_reservations r
      WHERE r.email = v_email
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

    -- raw_user_meta_data is only a carrier for the one-time capability.
    -- Remove the transient values before the Auth row is persisted.
    NEW.raw_user_meta_data :=
      COALESCE(NEW.raw_user_meta_data, '{}'::jsonb)
      - 'bootstrap_token'
      - 'account_type';

    -- Only this privileged BEFORE INSERT trigger can stamp the marker consumed
    -- by the tenant bootstrap below.
    NEW.raw_app_meta_data :=
      COALESCE(NEW.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('minarva_license_admin_bootstrap', true);

    RETURN NEW;
  END IF;

  -- While a reservation is active, do not let the configured bootstrap email
  -- be consumed by an unrelated normal customer signup.
  IF EXISTS (
    SELECT 1
    FROM license_private.admin_bootstrap_signup_reservations r
    WHERE r.email = v_email
      AND r.expires_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'LICENSE_ADMIN_BOOTSTRAP_EMAIL_RESERVED'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_license_admin_bootstrap_signup()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS on_auth_user_license_admin_bootstrap_guard ON auth.users;
CREATE TRIGGER on_auth_user_license_admin_bootstrap_guard
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION private.guard_license_admin_bootstrap_signup();


CREATE OR REPLACE FUNCTION private.bootstrap_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_org_id UUID;
  display_name TEXT;
  shop_name TEXT;
BEGIN
  -- Never trust raw_user_meta_data to bypass tenant creation. The BEFORE INSERT
  -- guard above is the only path that stamps this server-controlled marker.
  IF COALESCE(NEW.raw_app_meta_data ->> 'minarva_license_admin_bootstrap', '') = 'true' THEN
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

REVOKE ALL ON FUNCTION private.bootstrap_new_user()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.bootstrap_new_user() IS
  'Creates a Minarva Biz tenant organization, admin profile, membership and HQ branch for new business users; Cloudflare-reserved License Admin bootstrap users are excluded by a server-stamped marker.';
