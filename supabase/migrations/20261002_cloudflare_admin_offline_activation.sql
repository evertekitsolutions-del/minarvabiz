-- Cloudflare-native offline activation package preparation.
-- Requires AAL2 License Admin permission plus the Cloudflare-only edge secret.

CREATE OR REPLACE FUNCTION public.cloudflare_admin_prepare_offline_activation(
  p_license_id TEXT,
  p_device_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin JSONB;
  v_permissions JSONB;
  v_identity JSONB;
  v_license_id TEXT := btrim(COALESCE(p_license_id, ''));
  v_device_id TEXT := lower(btrim(COALESCE(p_device_id, '')));
  v_license RECORD;
  v_activation RECORD;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_display_name TEXT;
  v_error TEXT;
BEGIN
  v_admin := public.cloudflare_admin_me();
  IF COALESCE((v_admin ->> 'ok')::BOOLEAN, false) IS NOT TRUE THEN
    RETURN v_admin;
  END IF;

  v_permissions := COALESCE(v_admin -> 'permissions', '[]'::jsonb);
  IF NOT (v_permissions ? 'license.offline_activate') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'httpStatus', 403);
  END IF;

  IF char_length(v_license_id) < 1
     OR char_length(v_license_id) > 200
     OR v_device_id !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST', 'httpStatus', 400);
  END IF;

  SELECT
    l.id,
    l.license_id,
    l.token,
    l.status,
    l.expires_at
  INTO v_license
  FROM public.licenses l
  WHERE l.license_id = v_license_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'httpStatus', 404);
  END IF;

  IF v_license.status <> 'active' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'LICENSE_NOT_ACTIVE',
      'status', v_license.status,
      'httpStatus', 409
    );
  END IF;

  IF v_license.expires_at IS NOT NULL AND v_license.expires_at <= v_now THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EXPIRED', 'httpStatus', 409);
  END IF;

  BEGIN
    SELECT *
    INTO v_activation
    FROM public.activate_license_device(v_license.id, v_device_id);
  EXCEPTION
    WHEN OTHERS THEN
      v_error := SQLERRM;
      IF position('ACTIVATION_LIMIT_REACHED' in v_error) > 0 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ACTIVATION_LIMIT_REACHED', 'httpStatus', 409);
      END IF;
      IF position('LICENSE_EXPIRED' in v_error) > 0 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'EXPIRED', 'httpStatus', 409);
      END IF;
      IF position('LICENSE_NOT_ACTIVE' in v_error) > 0 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'LICENSE_NOT_ACTIVE', 'httpStatus', 409);
      END IF;
      RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE', 'httpStatus', 503);
  END;

  IF v_activation.activation_id IS NULL OR v_activation.activation_row_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE', 'httpStatus', 503);
  END IF;

  v_identity := v_admin -> 'identity';
  v_display_name := COALESCE(
    NULLIF(v_identity ->> 'displayName', ''),
    NULLIF(v_identity ->> 'email', ''),
    'Minarva Biz Administrator'
  );

  INSERT INTO public.license_events (
    id,
    license_id,
    activation_id,
    event_type,
    device_id,
    actor,
    details
  )
  VALUES (
    gen_random_uuid(),
    v_license.id,
    v_activation.activation_row_id,
    'activated',
    v_device_id,
    COALESCE(v_identity ->> 'email', 'cloudflare-admin'),
    jsonb_build_object(
      'mode', 'offline-package-created',
      'actorId', v_identity ->> 'id',
      'actorRole', v_identity ->> 'role',
      'authority', 'cloudflare'
    )
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
    COALESCE(v_identity ->> 'id', ''),
    COALESCE(v_identity ->> 'email', ''),
    left(v_display_name, 120),
    COALESCE(v_identity ->> 'role', ''),
    'supabase',
    'license.offline_activate',
    'success',
    'license',
    v_license.license_id,
    jsonb_build_object(
      'activationId', v_activation.activation_id,
      'deviceIdPrefix', left(v_device_id, 8),
      'authority', 'cloudflare'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'licenseToken', v_license.token,
    'licenseId', v_license.license_id,
    'activationId', v_activation.activation_id,
    'deviceId', v_device_id,
    'issuedAt', v_now,
    'expiresAt', v_license.expires_at,
    'httpStatus', 200
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE', 'httpStatus', 503);
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_prepare_offline_activation(TEXT, TEXT)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_prepare_offline_activation(TEXT, TEXT)
  TO authenticated;
