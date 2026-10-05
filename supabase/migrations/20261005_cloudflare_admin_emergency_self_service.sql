-- Render-independent emergency break-glass self-service authority.
-- Named AAL2 administrators may rotate/disable emergency access through
-- Cloudflare without reading or migrating the transitional Render secret.
--
-- Security:
--   * control RPCs are authenticated-only and admin-role only;
--   * raw emergency credentials never enter PostgreSQL;
--   * rotation keeps at most one previous digest for a fixed one-hour grace;
--   * every rotation/disable revokes all live emergency sessions;
--   * once manual authority owns the config, legacy Render sync cannot overwrite it.

CREATE OR REPLACE FUNCTION license_private.cloudflare_named_admin_control_identity()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_claims JSONB := auth.jwt();
  v_aal TEXT := COALESCE(v_claims ->> 'aal', '');
  v_email TEXT := lower(COALESCE(v_claims ->> 'email', ''));
  v_identity RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  END IF;

  IF v_aal <> 'aal2' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MFA_REQUIRED');
  END IF;

  SELECT
    i.auth_user_id,
    lower(i.email) AS email,
    i.display_name,
    i.role,
    i.status
  INTO v_identity
  FROM public.license_admin_identities i
  WHERE i.auth_user_id = v_uid
    AND i.status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_NOT_ALLOWED');
  END IF;

  IF v_email = '' OR v_identity.email <> v_email THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_IDENTITY_MISMATCH');
  END IF;

  IF v_identity.role <> 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'identity', jsonb_build_object(
      'id', v_identity.auth_user_id,
      'email', v_identity.email,
      'displayName', v_identity.display_name,
      'role', 'admin',
      'source', 'supabase'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION license_private.cloudflare_named_admin_control_identity()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.guard_manual_emergency_authority_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.source = 'legacy-render'
     AND EXISTS (
       SELECT 1
       FROM license_private.admin_emergency_runtime_config c
       WHERE c.id = 'primary'
         AND c.source = 'manual'
     ) THEN
    RAISE EXCEPTION 'MANUAL_EMERGENCY_AUTHORITY_OWNED'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_manual_emergency_authority_owner()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS admin_emergency_runtime_config_manual_owner
  ON license_private.admin_emergency_runtime_config;
CREATE TRIGGER admin_emergency_runtime_config_manual_owner
BEFORE INSERT OR UPDATE ON license_private.admin_emergency_runtime_config
FOR EACH ROW
EXECUTE FUNCTION private.guard_manual_emergency_authority_owner();

CREATE OR REPLACE FUNCTION public.cloudflare_admin_emergency_control_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_auth JSONB;
  v_config RECORD;
BEGIN
  v_auth := license_private.cloudflare_named_admin_control_identity();
  IF COALESCE((v_auth ->> 'ok')::BOOLEAN, false) IS NOT TRUE THEN
    RETURN v_auth;
  END IF;

  SELECT
    c.enabled,
    c.actor_email,
    c.display_name,
    c.source,
    c.updated_at
  INTO v_config
  FROM license_private.admin_emergency_runtime_config c
  WHERE c.id = 'primary'
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'enabled', COALESCE(v_config.enabled, false),
    'currentConfigured', EXISTS (
      SELECT 1
      FROM license_private.admin_emergency_credentials c
      WHERE c.slot = 'current'
        AND c.active = true
    ),
    'previousActive', EXISTS (
      SELECT 1
      FROM license_private.admin_emergency_credentials c
      WHERE c.slot = 'previous'
        AND c.active = true
        AND c.valid_until > v_now
        AND c.valid_until <= c.created_at + interval '24 hours'
    ),
    'actorEmail', COALESCE(v_config.actor_email, ''),
    'displayName', COALESCE(v_config.display_name, ''),
    'source', COALESCE(v_config.source, ''),
    'updatedAt', v_config.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cloudflare_admin_rotate_emergency_credential(
  p_current_sha256 TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_auth JSONB;
  v_identity JSONB;
  v_actor_id TEXT;
  v_actor_email TEXT;
  v_display_name TEXT;
  v_old_current TEXT;
  v_previous_until TIMESTAMPTZ := v_now + interval '1 hour';
BEGIN
  v_auth := license_private.cloudflare_named_admin_control_identity();
  IF COALESCE((v_auth ->> 'ok')::BOOLEAN, false) IS NOT TRUE THEN
    RETURN v_auth;
  END IF;

  IF p_current_sha256 IS NULL
     OR p_current_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  END IF;

  v_identity := v_auth -> 'identity';
  v_actor_id := COALESCE(v_identity ->> 'id', '');
  v_actor_email := lower(COALESCE(v_identity ->> 'email', ''));
  v_display_name := btrim(COALESCE(v_identity ->> 'displayName', ''));

  IF v_actor_id = ''
     OR char_length(v_actor_email) NOT BETWEEN 3 AND 254
     OR v_actor_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     OR char_length(v_display_name) NOT BETWEEN 1 AND 120 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_IDENTITY_MISMATCH');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('minarvabiz-emergency-authority-control-v1')
  );

  SELECT c.secret_sha256
  INTO v_old_current
  FROM license_private.admin_emergency_credentials c
  WHERE c.slot = 'current'
    AND c.active = true
  LIMIT 1;

  -- Remove a conflicting previous slot first, then replace current. This makes
  -- deliberate rollback/rotation safe under the unique digest constraint.
  DELETE FROM license_private.admin_emergency_credentials
  WHERE slot = 'previous'
    AND secret_sha256 = p_current_sha256;

  INSERT INTO license_private.admin_emergency_credentials (
    slot,
    secret_sha256,
    active,
    created_at,
    valid_until
  )
  VALUES (
    'current',
    p_current_sha256,
    true,
    v_now,
    NULL
  )
  ON CONFLICT (slot) DO UPDATE
  SET
    secret_sha256 = EXCLUDED.secret_sha256,
    active = true,
    created_at = CASE
      WHEN license_private.admin_emergency_credentials.secret_sha256
           IS DISTINCT FROM EXCLUDED.secret_sha256
        THEN v_now
      ELSE license_private.admin_emergency_credentials.created_at
    END,
    valid_until = NULL;

  IF v_old_current IS NOT NULL
     AND v_old_current <> p_current_sha256 THEN
    INSERT INTO license_private.admin_emergency_credentials (
      slot,
      secret_sha256,
      active,
      created_at,
      valid_until
    )
    VALUES (
      'previous',
      v_old_current,
      true,
      v_now,
      v_previous_until
    )
    ON CONFLICT (slot) DO UPDATE
    SET
      secret_sha256 = EXCLUDED.secret_sha256,
      active = true,
      created_at = v_now,
      valid_until = EXCLUDED.valid_until;
  ELSE
    DELETE FROM license_private.admin_emergency_credentials
    WHERE slot = 'previous';
  END IF;

  INSERT INTO license_private.admin_emergency_runtime_config (
    id,
    enabled,
    actor_email,
    display_name,
    source,
    updated_at
  )
  VALUES (
    'primary',
    true,
    v_actor_email,
    v_display_name,
    'manual',
    v_now
  )
  ON CONFLICT (id) DO UPDATE
  SET
    enabled = true,
    actor_email = EXCLUDED.actor_email,
    display_name = EXCLUDED.display_name,
    source = 'manual',
    updated_at = v_now;

  UPDATE public.license_admin_sessions
  SET
    revoked_at = v_now,
    revoke_reason = 'credential_rotation',
    last_seen_at = v_now
  WHERE source = 'emergency'
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
    NULL,
    v_actor_id,
    v_actor_email,
    v_display_name,
    'admin',
    'supabase',
    'admin.emergency.credential.rotate',
    'success',
    'emergency_authority',
    'primary',
    jsonb_build_object(
      'previousGraceSeconds',
      CASE WHEN v_old_current IS NOT NULL
                AND v_old_current <> p_current_sha256
           THEN 3600 ELSE 0 END
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'enabled', true,
    'currentConfigured', true,
    'previousActive',
      v_old_current IS NOT NULL AND v_old_current <> p_current_sha256,
    'previousValidUntil',
      CASE WHEN v_old_current IS NOT NULL
                AND v_old_current <> p_current_sha256
           THEN v_previous_until ELSE NULL END
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EMERGENCY_CREDENTIAL_CONFLICT');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EMERGENCY_CONTROL_UNAVAILABLE');
END;
$$;

CREATE OR REPLACE FUNCTION public.cloudflare_admin_disable_emergency_access()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_auth JSONB;
  v_identity JSONB;
  v_actor_id TEXT;
  v_actor_email TEXT;
  v_display_name TEXT;
BEGIN
  v_auth := license_private.cloudflare_named_admin_control_identity();
  IF COALESCE((v_auth ->> 'ok')::BOOLEAN, false) IS NOT TRUE THEN
    RETURN v_auth;
  END IF;

  v_identity := v_auth -> 'identity';
  v_actor_id := COALESCE(v_identity ->> 'id', '');
  v_actor_email := lower(COALESCE(v_identity ->> 'email', ''));
  v_display_name := btrim(COALESCE(v_identity ->> 'displayName', ''));

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('minarvabiz-emergency-authority-control-v1')
  );

  DELETE FROM license_private.admin_emergency_credentials;

  INSERT INTO license_private.admin_emergency_runtime_config (
    id,
    enabled,
    actor_email,
    display_name,
    source,
    updated_at
  )
  VALUES (
    'primary',
    false,
    v_actor_email,
    v_display_name,
    'manual',
    v_now
  )
  ON CONFLICT (id) DO UPDATE
  SET
    enabled = false,
    actor_email = EXCLUDED.actor_email,
    display_name = EXCLUDED.display_name,
    source = 'manual',
    updated_at = v_now;

  UPDATE public.license_admin_sessions
  SET
    revoked_at = v_now,
    revoke_reason = 'emergency_disabled',
    last_seen_at = v_now
  WHERE source = 'emergency'
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
    NULL,
    v_actor_id,
    v_actor_email,
    v_display_name,
    'admin',
    'supabase',
    'admin.emergency.disable',
    'success',
    'emergency_authority',
    'primary',
    jsonb_build_object('credentialsRemoved', true)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'enabled', false,
    'currentConfigured', false,
    'previousActive', false
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EMERGENCY_CONTROL_UNAVAILABLE');
END;
$$;

-- Edge-facing safe status now reads PostgreSQL runtime ownership/configuration,
-- removing the need for Cloudflare emergency actor/enable bindings.
CREATE OR REPLACE FUNCTION public.cloudflare_admin_emergency_status(
  p_edge_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_config RECORD;
BEGIN
  IF NOT license_private.cloudflare_edge_secret_valid(p_edge_secret) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  SELECT
    c.enabled,
    c.actor_email,
    c.display_name
  INTO v_config
  FROM license_private.admin_emergency_runtime_config c
  WHERE c.id = 'primary'
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'enabled', COALESCE(v_config.enabled, false),
    'actorConfigured',
      COALESCE(char_length(v_config.actor_email) BETWEEN 3 AND 254, false)
      AND COALESCE(char_length(v_config.display_name) BETWEEN 1 AND 120, false),
    'currentConfigured', EXISTS (
      SELECT 1
      FROM license_private.admin_emergency_credentials c
      WHERE c.slot = 'current'
        AND c.active = true
    ),
    'previousActive', EXISTS (
      SELECT 1
      FROM license_private.admin_emergency_credentials c
      WHERE c.slot = 'previous'
        AND c.active = true
        AND c.valid_until > v_now
        AND c.valid_until <= c.created_at + interval '24 hours'
    ),
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

CREATE OR REPLACE FUNCTION public.cloudflare_admin_emergency_login_v2(
  p_edge_secret TEXT,
  p_credential_sha256 TEXT,
  p_rate_key_hash TEXT,
  p_backoff_key_hash TEXT,
  p_token_sha256 TEXT
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
  v_config RECORD;
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
     OR p_token_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_REQUEST',
      'httpStatus', 400
    );
  END IF;

  SELECT
    c.enabled,
    lower(c.actor_email) AS actor_email,
    c.display_name
  INTO v_config
  FROM license_private.admin_emergency_runtime_config c
  WHERE c.id = 'primary'
  LIMIT 1;

  IF NOT FOUND
     OR v_config.enabled IS NOT TRUE
     OR char_length(v_config.actor_email) NOT BETWEEN 3 AND 254
     OR v_config.actor_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     OR char_length(v_config.display_name) NOT BETWEEN 1 AND 120 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_DISABLED',
      'httpStatus', 403
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
      'httpStatus', 429
    );
  END IF;

  v_actor_id :=
    'emergency:' ||
    left(encode(extensions.digest(v_config.actor_email, 'sha256'), 'hex'), 32);

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
      v_config.actor_email,
      v_config.display_name,
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
    v_config.actor_email,
    v_config.display_name,
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
    v_config.actor_email,
    v_config.display_name,
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
      'email', v_config.actor_email,
      'displayName', v_config.display_name,
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
  v_config RECORD;
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
    c.enabled,
    lower(c.actor_email) AS actor_email,
    c.display_name
  INTO v_config
  FROM license_private.admin_emergency_runtime_config c
  WHERE c.id = 'primary'
  LIMIT 1;

  IF NOT FOUND OR v_config.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHENTICATED',
      'httpStatus', 401
    );
  END IF;

  SELECT
    s.id,
    s.actor_id,
    lower(s.actor_email) AS actor_email,
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
     OR v_session.expires_at <= v_now
     OR v_session.actor_email <> v_config.actor_email
     OR v_session.display_name <> v_config.display_name THEN
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
      'role', 'admin',
      'source', 'emergency'
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

REVOKE ALL ON FUNCTION public.cloudflare_admin_emergency_control_status()
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.cloudflare_admin_rotate_emergency_credential(TEXT)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.cloudflare_admin_disable_emergency_access()
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.cloudflare_admin_emergency_login_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.cloudflare_admin_emergency_control_status()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_rotate_emergency_credential(TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_disable_emergency_access()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_emergency_login_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon;
