-- Zero-secret-exposure bridge from the transitional Render emergency
-- configuration into the private PostgreSQL emergency authority.
--
-- The trusted legacy server hashes its current/previous emergency credentials
-- locally and calls this RPC with digests only. Raw credentials never cross this
-- boundary and are never written to PostgreSQL.

CREATE TABLE IF NOT EXISTS license_private.admin_emergency_runtime_config (
  id TEXT PRIMARY KEY CHECK (id = 'primary'),
  enabled BOOLEAN NOT NULL DEFAULT false,
  actor_email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'legacy-render'
    CHECK (source IN ('legacy-render', 'manual')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_emergency_runtime_config_email_len
    CHECK (char_length(actor_email) BETWEEN 3 AND 254),
  CONSTRAINT admin_emergency_runtime_config_email_format
    CHECK (actor_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  CONSTRAINT admin_emergency_runtime_config_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 120)
);

ALTER TABLE license_private.admin_emergency_runtime_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE license_private.admin_emergency_runtime_config
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_license_admin_emergency_authority(
  p_current_sha256 TEXT,
  p_previous_sha256 TEXT,
  p_previous_valid_until TIMESTAMPTZ,
  p_enabled BOOLEAN,
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
  v_email TEXT := lower(btrim(COALESCE(p_actor_email, '')));
  v_display_name TEXT := btrim(COALESCE(p_display_name, ''));
  v_previous_active BOOLEAN := false;
  v_changed BOOLEAN := false;
  v_actor_id TEXT;
BEGIN
  IF p_current_sha256 IS NULL
     OR p_current_sha256 !~ '^[0-9a-f]{64}$'
     OR char_length(v_email) NOT BETWEEN 3 AND 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     OR char_length(v_display_name) NOT BETWEEN 1 AND 120 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_SYNC_CONFIGURATION',
      'httpStatus', 400
    );
  END IF;

  IF p_previous_sha256 IS NOT NULL OR p_previous_valid_until IS NOT NULL THEN
    IF p_previous_sha256 IS NULL
       OR p_previous_sha256 !~ '^[0-9a-f]{64}$'
       OR p_previous_sha256 = p_current_sha256
       OR p_previous_valid_until IS NULL
       OR p_previous_valid_until <= v_now
       OR p_previous_valid_until > v_now + interval '24 hours' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'INVALID_PREVIOUS_SYNC_CONFIGURATION',
        'httpStatus', 400
      );
    END IF;
    v_previous_active := true;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('minarvabiz-emergency-authority-sync-v1')
  );

  v_changed :=
    NOT EXISTS (
      SELECT 1
      FROM license_private.admin_emergency_credentials c
      WHERE c.slot = 'current'
        AND c.active = true
        AND c.secret_sha256 = p_current_sha256
        AND c.valid_until IS NULL
    )
    OR NOT EXISTS (
      SELECT 1
      FROM license_private.admin_emergency_runtime_config c
      WHERE c.id = 'primary'
        AND c.enabled = COALESCE(p_enabled, false)
        AND c.actor_email = v_email
        AND c.display_name = v_display_name
        AND c.source = 'legacy-render'
    )
    OR (
      v_previous_active
      AND NOT EXISTS (
        SELECT 1
        FROM license_private.admin_emergency_credentials c
        WHERE c.slot = 'previous'
          AND c.active = true
          AND c.secret_sha256 = p_previous_sha256
          AND c.valid_until = p_previous_valid_until
      )
    )
    OR (
      NOT v_previous_active
      AND EXISTS (
        SELECT 1
        FROM license_private.admin_emergency_credentials c
        WHERE c.slot = 'previous'
      )
    );

  -- Free the new current digest first if it is still occupying the previous
  -- rotation slot (for example during a deliberate rollback).
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
      WHEN license_private.admin_emergency_credentials.secret_sha256 IS DISTINCT FROM EXCLUDED.secret_sha256
        THEN v_now
      ELSE license_private.admin_emergency_credentials.created_at
    END,
    valid_until = NULL;

  IF v_previous_active THEN
    INSERT INTO license_private.admin_emergency_credentials (
      slot,
      secret_sha256,
      active,
      created_at,
      valid_until
    )
    VALUES (
      'previous',
      p_previous_sha256,
      true,
      v_now,
      p_previous_valid_until
    )
    ON CONFLICT (slot) DO UPDATE
    SET
      secret_sha256 = EXCLUDED.secret_sha256,
      active = true,
      created_at = CASE
        WHEN license_private.admin_emergency_credentials.secret_sha256 IS DISTINCT FROM EXCLUDED.secret_sha256
          OR license_private.admin_emergency_credentials.valid_until IS DISTINCT FROM EXCLUDED.valid_until
          THEN v_now
        ELSE license_private.admin_emergency_credentials.created_at
      END,
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
    COALESCE(p_enabled, false),
    v_email,
    v_display_name,
    'legacy-render',
    v_now
  )
  ON CONFLICT (id) DO UPDATE
  SET
    enabled = EXCLUDED.enabled,
    actor_email = EXCLUDED.actor_email,
    display_name = EXCLUDED.display_name,
    source = EXCLUDED.source,
    updated_at = CASE
      WHEN license_private.admin_emergency_runtime_config.enabled IS DISTINCT FROM EXCLUDED.enabled
        OR license_private.admin_emergency_runtime_config.actor_email IS DISTINCT FROM EXCLUDED.actor_email
        OR license_private.admin_emergency_runtime_config.display_name IS DISTINCT FROM EXCLUDED.display_name
        OR license_private.admin_emergency_runtime_config.source IS DISTINCT FROM EXCLUDED.source
        THEN v_now
      ELSE license_private.admin_emergency_runtime_config.updated_at
    END;

  IF v_changed THEN
    v_actor_id :=
      'emergency:' ||
      left(encode(extensions.digest(v_email, 'sha256'), 'hex'), 32);

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
      'admin.emergency.authority_sync',
      'success',
      'emergency_authority',
      'primary',
      jsonb_build_object(
        'authority', 'legacy-render-digest-sync',
        'enabled', COALESCE(p_enabled, false),
        'previousActive', v_previous_active
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'changed', v_changed,
    'enabled', COALESCE(p_enabled, false),
    'currentConfigured', true,
    'previousActive', v_previous_active,
    'httpStatus', 200
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_CREDENTIAL_CONFLICT',
      'httpStatus', 409
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SYNC_UNAVAILABLE',
      'httpStatus', 503
    );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_license_admin_emergency_authority(
  TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sync_license_admin_emergency_authority(
  TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT
) TO service_role;
