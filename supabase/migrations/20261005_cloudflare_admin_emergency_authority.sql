-- Cloudflare/self-host portable emergency License Admin authority foundation.
-- Additive only: the existing Next/Render emergency path stays available until
-- the Worker/browser replacement is proven end to end.
--
-- Security model:
--   * Browser sends the plaintext emergency credential only to the trusted edge.
--   * Edge sends only SHA-256 credential/session digests to PostgreSQL.
--   * PostgreSQL privately stores expected current/previous credential digests.
--   * A generic edge RPC secret alone cannot mint an emergency admin session.
--   * Persistent rate limiting, progressive backoff, revocation and audit remain
--     in PostgreSQL-compatible state.

-- Fix the historical progressive-backoff function additively. Its RETURNS TABLE
-- output name "failure_count" collides with the table column unless references
-- in UPDATE expressions are explicitly qualified.
CREATE OR REPLACE FUNCTION public.record_license_admin_login_failure(
  p_key_hash TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  failure_count INTEGER,
  retry_after_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_failure_count INTEGER;
  v_backoff_seconds INTEGER;
BEGIN
  IF p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid admin login backoff key' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.license_admin_login_backoff (
    key_hash, failure_count, blocked_until, last_failure_at, updated_at
  )
  VALUES (p_key_hash, 0, NULL, NULL, v_now)
  ON CONFLICT (key_hash) DO NOTHING;

  UPDATE public.license_admin_login_backoff AS b
  SET
    failure_count = CASE
      WHEN b.last_failure_at IS NULL OR b.last_failure_at < v_now - interval '1 hour' THEN 1
      ELSE LEAST(b.failure_count + 1, 10000)
    END,
    last_failure_at = v_now,
    updated_at = v_now
  WHERE b.key_hash = p_key_hash
  RETURNING b.failure_count
  INTO v_failure_count;

  v_backoff_seconds := LEAST(
    300,
    POWER(2::NUMERIC, LEAST(v_failure_count, 9))::INTEGER
  );

  UPDATE public.license_admin_login_backoff AS b
  SET
    blocked_until = v_now + make_interval(secs => v_backoff_seconds),
    updated_at = v_now
  WHERE b.key_hash = p_key_hash;

  RETURN QUERY SELECT FALSE, v_failure_count, v_backoff_seconds;
END;
$$;

REVOKE ALL ON FUNCTION public.record_license_admin_login_failure(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_license_admin_login_failure(TEXT)
  TO service_role;

ALTER TABLE public.license_admin_sessions
  ADD COLUMN IF NOT EXISTS edge_token_sha256 TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.license_admin_sessions'::regclass
      AND conname = 'license_admin_sessions_edge_token_sha256_format'
  ) THEN
    ALTER TABLE public.license_admin_sessions
      ADD CONSTRAINT license_admin_sessions_edge_token_sha256_format
      CHECK (
        edge_token_sha256 IS NULL
        OR edge_token_sha256 ~ '^[0-9a-f]{64}$'
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_license_admin_sessions_edge_token_sha256
  ON public.license_admin_sessions(edge_token_sha256)
  WHERE edge_token_sha256 IS NOT NULL;

CREATE TABLE IF NOT EXISTS license_private.admin_emergency_credentials (
  slot TEXT PRIMARY KEY CHECK (slot IN ('current', 'previous')),
  secret_sha256 TEXT NOT NULL UNIQUE
    CHECK (secret_sha256 ~ '^[0-9a-f]{64}
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  CONSTRAINT admin_emergency_credentials_rotation_window CHECK (
    (slot = 'current' AND valid_until IS NULL)
    OR
    (
      slot = 'previous'
      AND valid_until IS NOT NULL
      AND valid_until > created_at
      AND valid_until <= created_at + interval '24 hours'
    )
  )
);

ALTER TABLE license_private.admin_emergency_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE license_private.admin_emergency_credentials
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION license_private.cloudflare_edge_secret_valid(
  p_edge_secret TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_edge_secret IS NOT NULL
    AND char_length(p_edge_secret) BETWEEN 32 AND 512
    AND EXISTS (
      SELECT 1
      FROM license_private.edge_credentials c
      WHERE c.active = true
        AND c.secret_sha256 = encode(extensions.digest(p_edge_secret, 'sha256'), 'hex')
    );
$$;

REVOKE ALL ON FUNCTION license_private.cloudflare_edge_secret_valid(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION license_private.cloudflare_emergency_credential_match(
  p_credential_sha256 TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
  IF p_credential_sha256 IS NULL
     OR p_credential_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM license_private.admin_emergency_credentials c
    WHERE c.slot = 'current'
      AND c.active = true
      AND c.secret_sha256 = p_credential_sha256
  ) THEN
    RETURN 'current';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM license_private.admin_emergency_credentials c
    WHERE c.slot = 'previous'
      AND c.active = true
      AND c.secret_sha256 = p_credential_sha256
      AND c.valid_until > v_now
      AND c.valid_until <= c.created_at + interval '24 hours'
  ) THEN
    RETURN 'previous';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION license_private.cloudflare_emergency_credential_match(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cloudflare_admin_emergency_login(
  p_edge_secret TEXT,
  p_credential_sha256 TEXT,
  p_rate_key_hash TEXT,
  p_backoff_key_hash TEXT,
  p_token_sha256 TEXT,
  p_actor_email TEXT,
  p_display_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_rate RECORD;
  v_backoff RECORD;
  v_failure RECORD;
  v_retry_after INTEGER := 0;
  v_credential_match TEXT;
  v_email TEXT := lower(btrim(COALESCE(p_actor_email, '')));
  v_display_name TEXT := btrim(COALESCE(p_display_name, ''));
  v_actor_id TEXT;
  v_session_id UUID := gen_random_uuid();
  v_expires_at TIMESTAMPTZ;
  v_cleared BOOLEAN;
BEGIN
  IF NOT license_private.cloudflare_edge_secret_valid(p_edge_secret) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  IF p_credential_sha256 IS NULL
     OR p_credential_sha256 !~ '^[0-9a-f]{64}$'
     OR p_rate_key_hash IS NULL
     OR p_rate_key_hash !~ '^[0-9a-f]{64}$'
     OR p_backoff_key_hash IS NULL
     OR p_backoff_key_hash !~ '^[0-9a-f]{64}$'
     OR p_token_sha256 IS NULL
     OR p_token_sha256 !~ '^[0-9a-f]{64}$'
     OR char_length(v_email) NOT BETWEEN 3 AND 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+
     OR char_length(v_display_name) NOT BETWEEN 1 AND 120 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_REQUEST',
      'httpStatus', 400
    );
  END IF;

  SELECT *
  INTO v_rate
  FROM public.consume_license_rate_limit(
    'admin-emergency-login',
    p_rate_key_hash,
    8,
    15 * 60
  );

  SELECT *
  INTO v_backoff
  FROM public.check_license_admin_login_backoff(p_backoff_key_hash);

  IF NOT COALESCE(v_rate.allowed, false)
     OR NOT COALESCE(v_backoff.allowed, false) THEN
    v_retry_after := GREATEST(
      1,
      CASE
        WHEN COALESCE(v_rate.allowed, false) THEN 0
        ELSE CEIL(EXTRACT(EPOCH FROM (v_rate.reset_at - v_now)))::INTEGER
      END,
      COALESCE(v_backoff.retry_after_seconds, 0)
    );

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'RATE_LIMITED',
      'retryAfterSeconds', v_retry_after,
      'remaining', GREATEST(0, COALESCE(v_rate.remaining, 0)),
      'failureCount', GREATEST(0, COALESCE(v_backoff.failure_count, 0)),
      'httpStatus', 429
    );
  END IF;

  v_actor_id :=
    'emergency:' ||
    left(encode(extensions.digest(v_email, 'sha256'), 'hex'), 32);

  v_credential_match :=
    license_private.cloudflare_emergency_credential_match(p_credential_sha256);

  IF v_credential_match IS NULL THEN
    SELECT *
    INTO v_failure
    FROM public.record_license_admin_login_failure(p_backoff_key_hash);

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
      v_actor_id,
      v_email,
      v_display_name,
      'admin',
      'emergency',
      'admin.emergency.login',
      'denied',
      'license_admin_session',
      NULL,
      jsonb_build_object(
        'authority', 'cloudflare',
        'failureCount', GREATEST(1, COALESCE(v_failure.failure_count, 1)),
        'retryAfterSeconds', GREATEST(1, COALESCE(v_failure.retry_after_seconds, 1))
      )
    );

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_EMERGENCY_CREDENTIAL',
      'failureCount', GREATEST(1, COALESCE(v_failure.failure_count, 1)),
      'retryAfterSeconds', GREATEST(1, COALESCE(v_failure.retry_after_seconds, 1)),
      'httpStatus', 401
    );
  END IF;

  SELECT public.clear_license_admin_login_failures(p_backoff_key_hash)
  INTO v_cleared;

  IF NOT COALESCE(v_cleared, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  v_expires_at := v_now + interval '15 minutes';

  INSERT INTO public.license_admin_sessions (
    id,
    actor_id,
    auth_user_id,
    actor_email,
    display_name,
    source,
    auth_method,
    actor_role,
    created_at,
    expires_at,
    last_seen_at,
    edge_token_sha256
  )
  VALUES (
    v_session_id,
    v_actor_id,
    NULL,
    v_email,
    v_display_name,
    'emergency',
    'emergency',
    'admin',
    v_now,
    v_expires_at,
    v_now,
    p_token_sha256
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
    v_session_id,
    v_actor_id,
    v_email,
    v_display_name,
    'admin',
    'emergency',
    'admin.emergency.login',
    'success',
    'license_admin_session',
    v_session_id::TEXT,
    jsonb_build_object(
      'authority', 'cloudflare',
      'credentialSlot', v_credential_match,
      'expiresAt', v_expires_at
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'identity', jsonb_build_object(
      'id', v_actor_id,
      'email', v_email,
      'displayName', v_display_name,
      'role', 'admin',
      'source', 'emergency'
    ),
    'credentialMatch', v_credential_match,
    'sessionId', v_session_id,
    'expiresAt', v_expires_at,
    'httpStatus', 200
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'SESSION_TOKEN_CONFLICT',
      'httpStatus', 409
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.cloudflare_admin_emergency_me(
  p_edge_secret TEXT,
  p_token_sha256 TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_session RECORD;
BEGIN
  IF NOT license_private.cloudflare_edge_secret_valid(p_edge_secret) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  IF p_token_sha256 IS NULL
     OR p_token_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHENTICATED',
      'httpStatus', 401
    );
  END IF;

  SELECT
    s.id,
    s.actor_id,
    s.actor_email,
    s.display_name,
    s.actor_role,
    s.source,
    s.expires_at,
    s.revoked_at
  INTO v_session
  FROM public.license_admin_sessions s
  WHERE s.edge_token_sha256 = p_token_sha256
    AND s.source = 'emergency'
    AND s.auth_method = 'emergency'
    AND s.actor_role = 'admin'
  LIMIT 1;

  IF NOT FOUND
     OR v_session.revoked_at IS NOT NULL
     OR v_session.expires_at <= v_now THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHENTICATED',
      'httpStatus', 401
    );
  END IF;

  UPDATE public.license_admin_sessions
  SET last_seen_at = v_now
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'ok', true,
    'identity', jsonb_build_object(
      'id', v_session.actor_id,
      'email', v_session.actor_email,
      'displayName', v_session.display_name,
      'role', v_session.actor_role,
      'source', v_session.source
    ),
    'sessionId', v_session.id,
    'expiresAt', v_session.expires_at,
    'httpStatus', 200
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.cloudflare_admin_emergency_logout(
  p_edge_secret TEXT,
  p_token_sha256 TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_session RECORD;
BEGIN
  IF NOT license_private.cloudflare_edge_secret_valid(p_edge_secret) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  IF p_token_sha256 IS NULL
     OR p_token_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHENTICATED',
      'httpStatus', 401
    );
  END IF;

  SELECT
    s.id,
    s.actor_id,
    s.actor_email,
    s.display_name,
    s.actor_role,
    s.source
  INTO v_session
  FROM public.license_admin_sessions s
  WHERE s.edge_token_sha256 = p_token_sha256
    AND s.source = 'emergency'
    AND s.auth_method = 'emergency'
    AND s.actor_role = 'admin'
    AND s.revoked_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'httpStatus', 200);
  END IF;

  UPDATE public.license_admin_sessions
  SET
    revoked_at = v_now,
    revoke_reason = 'logout',
    last_seen_at = v_now
  WHERE id = v_session.id
    AND revoked_at IS NULL;

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
    v_session.id,
    v_session.actor_id,
    v_session.actor_email,
    v_session.display_name,
    v_session.actor_role,
    v_session.source,
    'admin.emergency.logout',
    'success',
    'license_admin_session',
    v_session.id::TEXT,
    jsonb_build_object('authority', 'cloudflare')
  );

  RETURN jsonb_build_object('ok', true, 'httpStatus', 200);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_emergency_login(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cloudflare_admin_emergency_me(TEXT, TEXT)
  FROM PUBLIC, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cloudflare_admin_emergency_logout(TEXT, TEXT)
  FROM PUBLIC, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.cloudflare_admin_emergency_login(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_emergency_me(TEXT, TEXT)
  TO anon;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_emergency_logout(TEXT, TEXT)
  TO anon;
),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  CONSTRAINT admin_emergency_credentials_rotation_window CHECK (
    (slot = 'current' AND valid_until IS NULL)
    OR
    (
      slot = 'previous'
      AND valid_until IS NOT NULL
      AND valid_until > created_at
      AND valid_until <= created_at + interval '24 hours'
    )
  )
);

ALTER TABLE license_private.admin_emergency_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE license_private.admin_emergency_credentials
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION license_private.cloudflare_edge_secret_valid(
  p_edge_secret TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_edge_secret IS NOT NULL
    AND char_length(p_edge_secret) BETWEEN 32 AND 512
    AND EXISTS (
      SELECT 1
      FROM license_private.edge_credentials c
      WHERE c.active = true
        AND c.secret_sha256 = encode(extensions.digest(p_edge_secret, 'sha256'), 'hex')
    );
$$;

REVOKE ALL ON FUNCTION license_private.cloudflare_edge_secret_valid(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION license_private.cloudflare_emergency_credential_match(
  p_credential_sha256 TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  IF p_credential_sha256 IS NULL
     OR p_credential_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM license_private.admin_emergency_credentials c
    WHERE c.slot = 'current'
      AND c.active = true
      AND c.secret_sha256 = p_credential_sha256
  ) THEN
    RETURN 'current';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM license_private.admin_emergency_credentials c
    WHERE c.slot = 'previous'
      AND c.active = true
      AND c.secret_sha256 = p_credential_sha256
      AND c.valid_until > v_now
      AND c.valid_until <= c.created_at + interval '24 hours'
  ) THEN
    RETURN 'previous';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION license_private.cloudflare_emergency_credential_match(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cloudflare_admin_emergency_login(
  p_edge_secret TEXT,
  p_credential_sha256 TEXT,
  p_rate_key_hash TEXT,
  p_backoff_key_hash TEXT,
  p_token_sha256 TEXT,
  p_actor_email TEXT,
  p_display_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_rate RECORD;
  v_backoff RECORD;
  v_failure RECORD;
  v_retry_after INTEGER := 0;
  v_credential_match TEXT;
  v_email TEXT := lower(btrim(COALESCE(p_actor_email, '')));
  v_display_name TEXT := btrim(COALESCE(p_display_name, ''));
  v_actor_id TEXT;
  v_session_id UUID := gen_random_uuid();
  v_expires_at TIMESTAMPTZ;
  v_cleared BOOLEAN;
BEGIN
  IF NOT license_private.cloudflare_edge_secret_valid(p_edge_secret) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  IF p_credential_sha256 IS NULL
     OR p_credential_sha256 !~ '^[0-9a-f]{64}$'
     OR p_rate_key_hash IS NULL
     OR p_rate_key_hash !~ '^[0-9a-f]{64}$'
     OR p_backoff_key_hash IS NULL
     OR p_backoff_key_hash !~ '^[0-9a-f]{64}$'
     OR p_token_sha256 IS NULL
     OR p_token_sha256 !~ '^[0-9a-f]{64}$'
     OR char_length(v_email) NOT BETWEEN 3 AND 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR char_length(v_display_name) NOT BETWEEN 1 AND 120 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_REQUEST',
      'httpStatus', 400
    );
  END IF;

  SELECT *
  INTO v_rate
  FROM public.consume_license_rate_limit(
    'admin-emergency-login',
    p_rate_key_hash,
    8,
    15 * 60
  );

  SELECT *
  INTO v_backoff
  FROM public.check_license_admin_login_backoff(p_backoff_key_hash);

  IF NOT COALESCE(v_rate.allowed, false)
     OR NOT COALESCE(v_backoff.allowed, false) THEN
    v_retry_after := GREATEST(
      1,
      CASE
        WHEN COALESCE(v_rate.allowed, false) THEN 0
        ELSE CEIL(EXTRACT(EPOCH FROM (v_rate.reset_at - v_now)))::INTEGER
      END,
      COALESCE(v_backoff.retry_after_seconds, 0)
    );

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'RATE_LIMITED',
      'retryAfterSeconds', v_retry_after,
      'remaining', GREATEST(0, COALESCE(v_rate.remaining, 0)),
      'failureCount', GREATEST(0, COALESCE(v_backoff.failure_count, 0)),
      'httpStatus', 429
    );
  END IF;

  v_actor_id :=
    'emergency:' ||
    left(encode(extensions.digest(v_email, 'sha256'), 'hex'), 32);

  v_credential_match :=
    license_private.cloudflare_emergency_credential_match(p_credential_sha256);

  IF v_credential_match IS NULL THEN
    SELECT *
    INTO v_failure
    FROM public.record_license_admin_login_failure(p_backoff_key_hash);

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
      v_actor_id,
      v_email,
      v_display_name,
      'admin',
      'emergency',
      'admin.emergency.login',
      'denied',
      'license_admin_session',
      NULL,
      jsonb_build_object(
        'authority', 'cloudflare',
        'failureCount', GREATEST(1, COALESCE(v_failure.failure_count, 1)),
        'retryAfterSeconds', GREATEST(1, COALESCE(v_failure.retry_after_seconds, 1))
      )
    );

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_EMERGENCY_CREDENTIAL',
      'failureCount', GREATEST(1, COALESCE(v_failure.failure_count, 1)),
      'retryAfterSeconds', GREATEST(1, COALESCE(v_failure.retry_after_seconds, 1)),
      'httpStatus', 401
    );
  END IF;

  SELECT public.clear_license_admin_login_failures(p_backoff_key_hash)
  INTO v_cleared;

  IF NOT COALESCE(v_cleared, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  v_expires_at := v_now + interval '15 minutes';

  INSERT INTO public.license_admin_sessions (
    id,
    actor_id,
    auth_user_id,
    actor_email,
    display_name,
    source,
    auth_method,
    actor_role,
    created_at,
    expires_at,
    last_seen_at,
    edge_token_sha256
  )
  VALUES (
    v_session_id,
    v_actor_id,
    NULL,
    v_email,
    v_display_name,
    'emergency',
    'emergency',
    'admin',
    v_now,
    v_expires_at,
    v_now,
    p_token_sha256
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
    v_session_id,
    v_actor_id,
    v_email,
    v_display_name,
    'admin',
    'emergency',
    'admin.emergency.login',
    'success',
    'license_admin_session',
    v_session_id::TEXT,
    jsonb_build_object(
      'authority', 'cloudflare',
      'credentialSlot', v_credential_match,
      'expiresAt', v_expires_at
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'identity', jsonb_build_object(
      'id', v_actor_id,
      'email', v_email,
      'displayName', v_display_name,
      'role', 'admin',
      'source', 'emergency'
    ),
    'credentialMatch', v_credential_match,
    'sessionId', v_session_id,
    'expiresAt', v_expires_at,
    'httpStatus', 200
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'SESSION_TOKEN_CONFLICT',
      'httpStatus', 409
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.cloudflare_admin_emergency_me(
  p_edge_secret TEXT,
  p_token_sha256 TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_session RECORD;
BEGIN
  IF NOT license_private.cloudflare_edge_secret_valid(p_edge_secret) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  IF p_token_sha256 IS NULL
     OR p_token_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHENTICATED',
      'httpStatus', 401
    );
  END IF;

  SELECT
    s.id,
    s.actor_id,
    s.actor_email,
    s.display_name,
    s.actor_role,
    s.source,
    s.expires_at,
    s.revoked_at
  INTO v_session
  FROM public.license_admin_sessions s
  WHERE s.edge_token_sha256 = p_token_sha256
    AND s.source = 'emergency'
    AND s.auth_method = 'emergency'
    AND s.actor_role = 'admin'
  LIMIT 1;

  IF NOT FOUND
     OR v_session.revoked_at IS NOT NULL
     OR v_session.expires_at <= v_now THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHENTICATED',
      'httpStatus', 401
    );
  END IF;

  UPDATE public.license_admin_sessions
  SET last_seen_at = v_now
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'ok', true,
    'identity', jsonb_build_object(
      'id', v_session.actor_id,
      'email', v_session.actor_email,
      'displayName', v_session.display_name,
      'role', v_session.actor_role,
      'source', v_session.source
    ),
    'sessionId', v_session.id,
    'expiresAt', v_session.expires_at,
    'httpStatus', 200
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.cloudflare_admin_emergency_logout(
  p_edge_secret TEXT,
  p_token_sha256 TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_session RECORD;
BEGIN
  IF NOT license_private.cloudflare_edge_secret_valid(p_edge_secret) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  IF p_token_sha256 IS NULL
     OR p_token_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHENTICATED',
      'httpStatus', 401
    );
  END IF;

  SELECT
    s.id,
    s.actor_id,
    s.actor_email,
    s.display_name,
    s.actor_role,
    s.source
  INTO v_session
  FROM public.license_admin_sessions s
  WHERE s.edge_token_sha256 = p_token_sha256
    AND s.source = 'emergency'
    AND s.auth_method = 'emergency'
    AND s.actor_role = 'admin'
    AND s.revoked_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'httpStatus', 200);
  END IF;

  UPDATE public.license_admin_sessions
  SET
    revoked_at = v_now,
    revoke_reason = 'logout',
    last_seen_at = v_now
  WHERE id = v_session.id
    AND revoked_at IS NULL;

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
    v_session.id,
    v_session.actor_id,
    v_session.actor_email,
    v_session.display_name,
    v_session.actor_role,
    v_session.source,
    'admin.emergency.logout',
    'success',
    'license_admin_session',
    v_session.id::TEXT,
    jsonb_build_object('authority', 'cloudflare')
  );

  RETURN jsonb_build_object('ok', true, 'httpStatus', 200);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_emergency_login(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cloudflare_admin_emergency_me(TEXT, TEXT)
  FROM PUBLIC, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cloudflare_admin_emergency_logout(TEXT, TEXT)
  FROM PUBLIC, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.cloudflare_admin_emergency_login(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_emergency_me(TEXT, TEXT)
  TO anon;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_emergency_logout(TEXT, TEXT)
  TO anon;

     OR char_length(v_display_name) NOT BETWEEN 1 AND 120 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_REQUEST',
      'httpStatus', 400
    );
  END IF;

  SELECT *
  INTO v_rate
  FROM public.consume_license_rate_limit(
    'admin-emergency-login',
    p_rate_key_hash,
    8,
    15 * 60
  );

  SELECT *
  INTO v_backoff
  FROM public.check_license_admin_login_backoff(p_backoff_key_hash);

  IF NOT COALESCE(v_rate.allowed, false)
     OR NOT COALESCE(v_backoff.allowed, false) THEN
    v_retry_after := GREATEST(
      1,
      CASE
        WHEN COALESCE(v_rate.allowed, false) THEN 0
        ELSE CEIL(EXTRACT(EPOCH FROM (v_rate.reset_at - v_now)))::INTEGER
      END,
      COALESCE(v_backoff.retry_after_seconds, 0)
    );

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'RATE_LIMITED',
      'retryAfterSeconds', v_retry_after,
      'remaining', GREATEST(0, COALESCE(v_rate.remaining, 0)),
      'failureCount', GREATEST(0, COALESCE(v_backoff.failure_count, 0)),
      'httpStatus', 429
    );
  END IF;

  v_actor_id :=
    'emergency:' ||
    left(encode(extensions.digest(v_email, 'sha256'), 'hex'), 32);

  v_credential_match :=
    license_private.cloudflare_emergency_credential_match(p_credential_sha256);

  IF v_credential_match IS NULL THEN
    SELECT *
    INTO v_failure
    FROM public.record_license_admin_login_failure(p_backoff_key_hash);

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
      v_actor_id,
      v_email,
      v_display_name,
      'admin',
      'emergency',
      'admin.emergency.login',
      'denied',
      'license_admin_session',
      NULL,
      jsonb_build_object(
        'authority', 'cloudflare',
        'failureCount', GREATEST(1, COALESCE(v_failure.failure_count, 1)),
        'retryAfterSeconds', GREATEST(1, COALESCE(v_failure.retry_after_seconds, 1))
      )
    );

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_EMERGENCY_CREDENTIAL',
      'failureCount', GREATEST(1, COALESCE(v_failure.failure_count, 1)),
      'retryAfterSeconds', GREATEST(1, COALESCE(v_failure.retry_after_seconds, 1)),
      'httpStatus', 401
    );
  END IF;

  SELECT public.clear_license_admin_login_failures(p_backoff_key_hash)
  INTO v_cleared;

  IF NOT COALESCE(v_cleared, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  v_expires_at := v_now + interval '15 minutes';

  INSERT INTO public.license_admin_sessions (
    id,
    actor_id,
    auth_user_id,
    actor_email,
    display_name,
    source,
    auth_method,
    actor_role,
    created_at,
    expires_at,
    last_seen_at,
    edge_token_sha256
  )
  VALUES (
    v_session_id,
    v_actor_id,
    NULL,
    v_email,
    v_display_name,
    'emergency',
    'emergency',
    'admin',
    v_now,
    v_expires_at,
    v_now,
    p_token_sha256
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
    v_session_id,
    v_actor_id,
    v_email,
    v_display_name,
    'admin',
    'emergency',
    'admin.emergency.login',
    'success',
    'license_admin_session',
    v_session_id::TEXT,
    jsonb_build_object(
      'authority', 'cloudflare',
      'credentialSlot', v_credential_match,
      'expiresAt', v_expires_at
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'identity', jsonb_build_object(
      'id', v_actor_id,
      'email', v_email,
      'displayName', v_display_name,
      'role', 'admin',
      'source', 'emergency'
    ),
    'credentialMatch', v_credential_match,
    'sessionId', v_session_id,
    'expiresAt', v_expires_at,
    'httpStatus', 200
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'SESSION_TOKEN_CONFLICT',
      'httpStatus', 409
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.cloudflare_admin_emergency_me(
  p_edge_secret TEXT,
  p_token_sha256 TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_session RECORD;
BEGIN
  IF NOT license_private.cloudflare_edge_secret_valid(p_edge_secret) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  IF p_token_sha256 IS NULL
     OR p_token_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHENTICATED',
      'httpStatus', 401
    );
  END IF;

  SELECT
    s.id,
    s.actor_id,
    s.actor_email,
    s.display_name,
    s.actor_role,
    s.source,
    s.expires_at,
    s.revoked_at
  INTO v_session
  FROM public.license_admin_sessions s
  WHERE s.edge_token_sha256 = p_token_sha256
    AND s.source = 'emergency'
    AND s.auth_method = 'emergency'
    AND s.actor_role = 'admin'
  LIMIT 1;

  IF NOT FOUND
     OR v_session.revoked_at IS NOT NULL
     OR v_session.expires_at <= v_now THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHENTICATED',
      'httpStatus', 401
    );
  END IF;

  UPDATE public.license_admin_sessions
  SET last_seen_at = v_now
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'ok', true,
    'identity', jsonb_build_object(
      'id', v_session.actor_id,
      'email', v_session.actor_email,
      'displayName', v_session.display_name,
      'role', v_session.actor_role,
      'source', v_session.source
    ),
    'sessionId', v_session.id,
    'expiresAt', v_session.expires_at,
    'httpStatus', 200
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.cloudflare_admin_emergency_logout(
  p_edge_secret TEXT,
  p_token_sha256 TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_session RECORD;
BEGIN
  IF NOT license_private.cloudflare_edge_secret_valid(p_edge_secret) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  IF p_token_sha256 IS NULL
     OR p_token_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHENTICATED',
      'httpStatus', 401
    );
  END IF;

  SELECT
    s.id,
    s.actor_id,
    s.actor_email,
    s.display_name,
    s.actor_role,
    s.source
  INTO v_session
  FROM public.license_admin_sessions s
  WHERE s.edge_token_sha256 = p_token_sha256
    AND s.source = 'emergency'
    AND s.auth_method = 'emergency'
    AND s.actor_role = 'admin'
    AND s.revoked_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'httpStatus', 200);
  END IF;

  UPDATE public.license_admin_sessions
  SET
    revoked_at = v_now,
    revoke_reason = 'logout',
    last_seen_at = v_now
  WHERE id = v_session.id
    AND revoked_at IS NULL;

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
    v_session.id,
    v_session.actor_id,
    v_session.actor_email,
    v_session.display_name,
    v_session.actor_role,
    v_session.source,
    'admin.emergency.logout',
    'success',
    'license_admin_session',
    v_session.id::TEXT,
    jsonb_build_object('authority', 'cloudflare')
  );

  RETURN jsonb_build_object('ok', true, 'httpStatus', 200);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_emergency_login(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cloudflare_admin_emergency_me(TEXT, TEXT)
  FROM PUBLIC, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cloudflare_admin_emergency_logout(TEXT, TEXT)
  FROM PUBLIC, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.cloudflare_admin_emergency_login(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_emergency_me(TEXT, TEXT)
  TO anon;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_emergency_logout(TEXT, TEXT)
  TO anon;
),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  CONSTRAINT admin_emergency_credentials_rotation_window CHECK (
    (slot = 'current' AND valid_until IS NULL)
    OR
    (
      slot = 'previous'
      AND valid_until IS NOT NULL
      AND valid_until > created_at
      AND valid_until <= created_at + interval '24 hours'
    )
  )
);

ALTER TABLE license_private.admin_emergency_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE license_private.admin_emergency_credentials
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION license_private.cloudflare_edge_secret_valid(
  p_edge_secret TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_edge_secret IS NOT NULL
    AND char_length(p_edge_secret) BETWEEN 32 AND 512
    AND EXISTS (
      SELECT 1
      FROM license_private.edge_credentials c
      WHERE c.active = true
        AND c.secret_sha256 = encode(extensions.digest(p_edge_secret, 'sha256'), 'hex')
    );
$$;

REVOKE ALL ON FUNCTION license_private.cloudflare_edge_secret_valid(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION license_private.cloudflare_emergency_credential_match(
  p_credential_sha256 TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  IF p_credential_sha256 IS NULL
     OR p_credential_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM license_private.admin_emergency_credentials c
    WHERE c.slot = 'current'
      AND c.active = true
      AND c.secret_sha256 = p_credential_sha256
  ) THEN
    RETURN 'current';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM license_private.admin_emergency_credentials c
    WHERE c.slot = 'previous'
      AND c.active = true
      AND c.secret_sha256 = p_credential_sha256
      AND c.valid_until > v_now
      AND c.valid_until <= c.created_at + interval '24 hours'
  ) THEN
    RETURN 'previous';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION license_private.cloudflare_emergency_credential_match(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cloudflare_admin_emergency_login(
  p_edge_secret TEXT,
  p_credential_sha256 TEXT,
  p_rate_key_hash TEXT,
  p_backoff_key_hash TEXT,
  p_token_sha256 TEXT,
  p_actor_email TEXT,
  p_display_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_rate RECORD;
  v_backoff RECORD;
  v_failure RECORD;
  v_retry_after INTEGER := 0;
  v_credential_match TEXT;
  v_email TEXT := lower(btrim(COALESCE(p_actor_email, '')));
  v_display_name TEXT := btrim(COALESCE(p_display_name, ''));
  v_actor_id TEXT;
  v_session_id UUID := gen_random_uuid();
  v_expires_at TIMESTAMPTZ;
  v_cleared BOOLEAN;
BEGIN
  IF NOT license_private.cloudflare_edge_secret_valid(p_edge_secret) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  IF p_credential_sha256 IS NULL
     OR p_credential_sha256 !~ '^[0-9a-f]{64}$'
     OR p_rate_key_hash IS NULL
     OR p_rate_key_hash !~ '^[0-9a-f]{64}$'
     OR p_backoff_key_hash IS NULL
     OR p_backoff_key_hash !~ '^[0-9a-f]{64}$'
     OR p_token_sha256 IS NULL
     OR p_token_sha256 !~ '^[0-9a-f]{64}$'
     OR char_length(v_email) NOT BETWEEN 3 AND 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR char_length(v_display_name) NOT BETWEEN 1 AND 120 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_REQUEST',
      'httpStatus', 400
    );
  END IF;

  SELECT *
  INTO v_rate
  FROM public.consume_license_rate_limit(
    'admin-emergency-login',
    p_rate_key_hash,
    8,
    15 * 60
  );

  SELECT *
  INTO v_backoff
  FROM public.check_license_admin_login_backoff(p_backoff_key_hash);

  IF NOT COALESCE(v_rate.allowed, false)
     OR NOT COALESCE(v_backoff.allowed, false) THEN
    v_retry_after := GREATEST(
      1,
      CASE
        WHEN COALESCE(v_rate.allowed, false) THEN 0
        ELSE CEIL(EXTRACT(EPOCH FROM (v_rate.reset_at - v_now)))::INTEGER
      END,
      COALESCE(v_backoff.retry_after_seconds, 0)
    );

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'RATE_LIMITED',
      'retryAfterSeconds', v_retry_after,
      'remaining', GREATEST(0, COALESCE(v_rate.remaining, 0)),
      'failureCount', GREATEST(0, COALESCE(v_backoff.failure_count, 0)),
      'httpStatus', 429
    );
  END IF;

  v_actor_id :=
    'emergency:' ||
    left(encode(extensions.digest(v_email, 'sha256'), 'hex'), 32);

  v_credential_match :=
    license_private.cloudflare_emergency_credential_match(p_credential_sha256);

  IF v_credential_match IS NULL THEN
    SELECT *
    INTO v_failure
    FROM public.record_license_admin_login_failure(p_backoff_key_hash);

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
      v_actor_id,
      v_email,
      v_display_name,
      'admin',
      'emergency',
      'admin.emergency.login',
      'denied',
      'license_admin_session',
      NULL,
      jsonb_build_object(
        'authority', 'cloudflare',
        'failureCount', GREATEST(1, COALESCE(v_failure.failure_count, 1)),
        'retryAfterSeconds', GREATEST(1, COALESCE(v_failure.retry_after_seconds, 1))
      )
    );

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_EMERGENCY_CREDENTIAL',
      'failureCount', GREATEST(1, COALESCE(v_failure.failure_count, 1)),
      'retryAfterSeconds', GREATEST(1, COALESCE(v_failure.retry_after_seconds, 1)),
      'httpStatus', 401
    );
  END IF;

  SELECT public.clear_license_admin_login_failures(p_backoff_key_hash)
  INTO v_cleared;

  IF NOT COALESCE(v_cleared, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  v_expires_at := v_now + interval '15 minutes';

  INSERT INTO public.license_admin_sessions (
    id,
    actor_id,
    auth_user_id,
    actor_email,
    display_name,
    source,
    auth_method,
    actor_role,
    created_at,
    expires_at,
    last_seen_at,
    edge_token_sha256
  )
  VALUES (
    v_session_id,
    v_actor_id,
    NULL,
    v_email,
    v_display_name,
    'emergency',
    'emergency',
    'admin',
    v_now,
    v_expires_at,
    v_now,
    p_token_sha256
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
    v_session_id,
    v_actor_id,
    v_email,
    v_display_name,
    'admin',
    'emergency',
    'admin.emergency.login',
    'success',
    'license_admin_session',
    v_session_id::TEXT,
    jsonb_build_object(
      'authority', 'cloudflare',
      'credentialSlot', v_credential_match,
      'expiresAt', v_expires_at
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'identity', jsonb_build_object(
      'id', v_actor_id,
      'email', v_email,
      'displayName', v_display_name,
      'role', 'admin',
      'source', 'emergency'
    ),
    'credentialMatch', v_credential_match,
    'sessionId', v_session_id,
    'expiresAt', v_expires_at,
    'httpStatus', 200
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'SESSION_TOKEN_CONFLICT',
      'httpStatus', 409
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.cloudflare_admin_emergency_me(
  p_edge_secret TEXT,
  p_token_sha256 TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_session RECORD;
BEGIN
  IF NOT license_private.cloudflare_edge_secret_valid(p_edge_secret) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  IF p_token_sha256 IS NULL
     OR p_token_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHENTICATED',
      'httpStatus', 401
    );
  END IF;

  SELECT
    s.id,
    s.actor_id,
    s.actor_email,
    s.display_name,
    s.actor_role,
    s.source,
    s.expires_at,
    s.revoked_at
  INTO v_session
  FROM public.license_admin_sessions s
  WHERE s.edge_token_sha256 = p_token_sha256
    AND s.source = 'emergency'
    AND s.auth_method = 'emergency'
    AND s.actor_role = 'admin'
  LIMIT 1;

  IF NOT FOUND
     OR v_session.revoked_at IS NOT NULL
     OR v_session.expires_at <= v_now THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHENTICATED',
      'httpStatus', 401
    );
  END IF;

  UPDATE public.license_admin_sessions
  SET last_seen_at = v_now
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'ok', true,
    'identity', jsonb_build_object(
      'id', v_session.actor_id,
      'email', v_session.actor_email,
      'displayName', v_session.display_name,
      'role', v_session.actor_role,
      'source', v_session.source
    ),
    'sessionId', v_session.id,
    'expiresAt', v_session.expires_at,
    'httpStatus', 200
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.cloudflare_admin_emergency_logout(
  p_edge_secret TEXT,
  p_token_sha256 TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_session RECORD;
BEGIN
  IF NOT license_private.cloudflare_edge_secret_valid(p_edge_secret) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  IF p_token_sha256 IS NULL
     OR p_token_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHENTICATED',
      'httpStatus', 401
    );
  END IF;

  SELECT
    s.id,
    s.actor_id,
    s.actor_email,
    s.display_name,
    s.actor_role,
    s.source
  INTO v_session
  FROM public.license_admin_sessions s
  WHERE s.edge_token_sha256 = p_token_sha256
    AND s.source = 'emergency'
    AND s.auth_method = 'emergency'
    AND s.actor_role = 'admin'
    AND s.revoked_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'httpStatus', 200);
  END IF;

  UPDATE public.license_admin_sessions
  SET
    revoked_at = v_now,
    revoke_reason = 'logout',
    last_seen_at = v_now
  WHERE id = v_session.id
    AND revoked_at IS NULL;

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
    v_session.id,
    v_session.actor_id,
    v_session.actor_email,
    v_session.display_name,
    v_session.actor_role,
    v_session.source,
    'admin.emergency.logout',
    'success',
    'license_admin_session',
    v_session.id::TEXT,
    jsonb_build_object('authority', 'cloudflare')
  );

  RETURN jsonb_build_object('ok', true, 'httpStatus', 200);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_emergency_login(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cloudflare_admin_emergency_me(TEXT, TEXT)
  FROM PUBLIC, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cloudflare_admin_emergency_logout(TEXT, TEXT)
  FROM PUBLIC, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.cloudflare_admin_emergency_login(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_emergency_me(TEXT, TEXT)
  TO anon;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_emergency_logout(TEXT, TEXT)
  TO anon;
