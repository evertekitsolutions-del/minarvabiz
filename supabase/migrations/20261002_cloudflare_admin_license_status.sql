-- Cloudflare-native License Admin status management.
-- Requires MFA AAL2, active admin allowlist identity, and license.status_manage.

CREATE OR REPLACE FUNCTION public.cloudflare_admin_set_license_status(
  p_license_id TEXT,
  p_status TEXT
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
  v_license RECORD;
  v_license_id TEXT := btrim(COALESCE(p_license_id, ''));
  v_status TEXT := btrim(COALESCE(p_status, ''));
  v_now TIMESTAMPTZ := clock_timestamp();
  v_event_type TEXT;
  v_deactivated_count INTEGER := 0;
  v_display_name TEXT;
BEGIN
  v_admin := public.cloudflare_admin_me();
  IF COALESCE((v_admin ->> 'ok')::BOOLEAN, false) IS NOT TRUE THEN
    RETURN v_admin;
  END IF;

  v_permissions := COALESCE(v_admin -> 'permissions', '[]'::jsonb);
  IF NOT (v_permissions ? 'license.status_manage') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'httpStatus', 403);
  END IF;

  IF char_length(v_license_id) < 1
     OR char_length(v_license_id) > 200
     OR v_status NOT IN ('active', 'suspended', 'revoked', 'deactivated') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST', 'httpStatus', 400);
  END IF;

  SELECT
    l.id,
    l.license_id,
    l.status
  INTO v_license
  FROM public.licenses l
  WHERE l.license_id = v_license_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'httpStatus', 404);
  END IF;

  UPDATE public.licenses
  SET status = v_status,
      updated_at = v_now
  WHERE id = v_license.id;

  IF v_status <> 'active' THEN
    UPDATE public.license_activations
    SET status = 'deactivated',
        deactivated_at = v_now
    WHERE license_id = v_license.id
      AND status = 'active';
    GET DIAGNOSTICS v_deactivated_count = ROW_COUNT;
  END IF;

  v_event_type := CASE v_status
    WHEN 'suspended' THEN 'suspended'
    WHEN 'revoked' THEN 'revoked'
    WHEN 'deactivated' THEN 'deactivated'
    ELSE 'activated'
  END;

  v_identity := v_admin -> 'identity';
  v_display_name := COALESCE(
    NULLIF(v_identity ->> 'displayName', ''),
    NULLIF(v_identity ->> 'email', ''),
    'Minarva Biz Administrator'
  );

  INSERT INTO public.license_events (
    id,
    license_id,
    event_type,
    actor,
    details
  )
  VALUES (
    gen_random_uuid(),
    v_license.id,
    v_event_type,
    COALESCE(v_identity ->> 'email', 'cloudflare-admin'),
    jsonb_build_object(
      'previousStatus', v_license.status,
      'status', v_status,
      'actorId', v_identity ->> 'id',
      'actorRole', v_identity ->> 'role',
      'deactivatedActivations', v_deactivated_count,
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
    'license.status_change',
    'success',
    'license',
    v_license_id,
    jsonb_build_object(
      'previousStatus', v_license.status,
      'status', v_status,
      'deactivatedActivations', v_deactivated_count,
      'authority', 'cloudflare'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'license', jsonb_build_object(
      'license_id', v_license_id,
      'previous_status', v_license.status,
      'status', v_status,
      'deactivated_activations', v_deactivated_count,
      'updated_at', v_now
    ),
    'httpStatus', 200
  );
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST', 'httpStatus', 400);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE', 'httpStatus', 503);
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_set_license_status(TEXT, TEXT)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_set_license_status(TEXT, TEXT)
  TO authenticated;
