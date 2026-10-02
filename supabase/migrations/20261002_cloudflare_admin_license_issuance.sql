-- Cloudflare-native commercial license issuance.
-- Requires both:
--   1) authenticated AAL2 License Admin with license.issue permission
--   2) the Cloudflare-only edge secret
-- This prevents direct browser RPC calls from inserting unsigned/fake license tokens.

CREATE OR REPLACE FUNCTION public.cloudflare_admin_issue_license(
  p_edge_secret TEXT,
  p_license_id UUID,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_plan TEXT,
  p_edition TEXT,
  p_expires_at TIMESTAMPTZ,
  p_activation_limit INTEGER,
  p_features JSONB,
  p_token TEXT,
  p_token_sha256 TEXT,
  p_issued_at TIMESTAMPTZ
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
  v_secret_hash TEXT;
  v_customer_name TEXT := btrim(COALESCE(p_customer_name, ''));
  v_plan TEXT := btrim(COALESCE(p_plan, ''));
  v_edition TEXT := btrim(COALESCE(p_edition, ''));
  v_token TEXT := btrim(COALESCE(p_token, ''));
  v_token_sha256 TEXT := lower(btrim(COALESCE(p_token_sha256, '')));
  v_now TIMESTAMPTZ := clock_timestamp();
  v_database_id UUID := gen_random_uuid();
  v_max_devices INTEGER;
  v_base_features JSONB;
  v_feature_keys TEXT[] := ARRAY[
    'sales','customers','inventory','tailoring','orders','laundry','reports',
    'staff','advancedReports','cloudSync','multiUser','multiBranch','apiAccess'
  ];
  v_display_name TEXT;
BEGIN
  v_admin := public.cloudflare_admin_me();
  IF COALESCE((v_admin ->> 'ok')::BOOLEAN, false) IS NOT TRUE THEN
    RETURN v_admin;
  END IF;

  v_permissions := COALESCE(v_admin -> 'permissions', '[]'::jsonb);
  IF NOT (v_permissions ? 'license.issue') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'httpStatus', 403);
  END IF;

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

  IF p_license_id IS NULL
     OR p_customer_id IS NULL
     OR char_length(v_customer_name) < 1
     OR char_length(v_customer_name) > 200
     OR v_plan NOT IN ('trial', 'basic', 'professional', 'business', 'enterprise')
     OR v_edition NOT IN ('online', 'offline', 'hybrid')
     OR p_issued_at IS NULL
     OR p_issued_at < v_now - interval '5 minutes'
     OR p_issued_at > v_now + interval '1 minute'
     OR (p_expires_at IS NOT NULL AND p_expires_at < p_issued_at)
     OR char_length(v_token) < 1
     OR char_length(v_token) > 2000
     OR v_token_sha256 !~ '^[0-9a-f]{64}$'
     OR v_token_sha256 <> encode(extensions.digest(v_token, 'sha256'), 'hex') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST', 'httpStatus', 400);
  END IF;

  v_max_devices := CASE v_plan
    WHEN 'trial' THEN 1
    WHEN 'basic' THEN 1
    WHEN 'professional' THEN 2
    WHEN 'business' THEN 5
    ELSE -1
  END;

  IF v_max_devices = -1 THEN
    IF p_activation_limit IS NULL OR (p_activation_limit <> -1 AND p_activation_limit < 1) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ACTIVATION_LIMIT', 'httpStatus', 400);
    END IF;
  ELSE
    IF p_activation_limit IS NULL
       OR p_activation_limit < 1
       OR p_activation_limit > v_max_devices THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ACTIVATION_LIMIT', 'httpStatus', 400);
    END IF;
  END IF;

  v_base_features := CASE v_plan
    WHEN 'trial' THEN jsonb_build_object(
      'sales',true,'customers',true,'inventory',true,'tailoring',true,'orders',true,
      'laundry',true,'reports',true,'staff',true,'advancedReports',true,'cloudSync',true,
      'multiUser',true,'multiBranch',true,'apiAccess',true
    )
    WHEN 'basic' THEN jsonb_build_object(
      'sales',true,'customers',true,'inventory',true,'tailoring',false,'orders',false,
      'laundry',false,'reports',false,'staff',false,'advancedReports',false,'cloudSync',false,
      'multiUser',false,'multiBranch',false,'apiAccess',false
    )
    WHEN 'professional' THEN jsonb_build_object(
      'sales',true,'customers',true,'inventory',true,'tailoring',true,'orders',true,
      'laundry',true,'reports',true,'staff',false,'advancedReports',false,'cloudSync',false,
      'multiUser',false,'multiBranch',false,'apiAccess',false
    )
    WHEN 'business' THEN jsonb_build_object(
      'sales',true,'customers',true,'inventory',true,'tailoring',true,'orders',true,
      'laundry',true,'reports',true,'staff',true,'advancedReports',true,'cloudSync',true,
      'multiUser',true,'multiBranch',false,'apiAccess',false
    )
    ELSE jsonb_build_object(
      'sales',true,'customers',true,'inventory',true,'tailoring',true,'orders',true,
      'laundry',true,'reports',true,'staff',true,'advancedReports',true,'cloudSync',true,
      'multiUser',true,'multiBranch',true,'apiAccess',true
    )
  END;

  IF p_features IS NULL
     OR jsonb_typeof(p_features) <> 'object'
     OR NOT (p_features ?& v_feature_keys)
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(p_features) AS k(key)
       WHERE NOT (k.key = ANY(v_feature_keys))
     )
     OR EXISTS (
       SELECT 1
       FROM jsonb_each(p_features) AS e(key, value)
       WHERE jsonb_typeof(e.value) <> 'boolean'
     )
     OR EXISTS (
       SELECT 1
       FROM jsonb_each(p_features) AS e(key, value)
       WHERE e.value = 'true'::jsonb
         AND COALESCE((v_base_features ->> e.key)::BOOLEAN, false) = false
     ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_FEATURES', 'httpStatus', 400);
  END IF;

  v_identity := v_admin -> 'identity';
  v_display_name := COALESCE(
    NULLIF(v_identity ->> 'displayName', ''),
    NULLIF(v_identity ->> 'email', ''),
    'Minarva Biz Administrator'
  );

  INSERT INTO public.licenses (
    id,
    license_id,
    customer_id,
    product,
    edition,
    plan,
    status,
    token,
    token_sha256,
    issued_at,
    expires_at,
    activation_limit,
    features,
    metadata
  )
  VALUES (
    v_database_id,
    p_license_id::TEXT,
    p_customer_id::TEXT,
    'minarvabiz',
    v_edition,
    v_plan,
    'active',
    v_token,
    v_token_sha256,
    p_issued_at,
    p_expires_at,
    p_activation_limit,
    p_features,
    jsonb_build_object('customerName', v_customer_name)
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
    v_database_id,
    'issued',
    COALESCE(v_identity ->> 'email', 'cloudflare-admin'),
    jsonb_build_object(
      'customerName', v_customer_name,
      'plan', v_plan,
      'edition', v_edition,
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
    'license.issue',
    'success',
    'license',
    p_license_id::TEXT,
    jsonb_build_object(
      'customerName', v_customer_name,
      'plan', v_plan,
      'edition', v_edition,
      'activationLimit', p_activation_limit,
      'authority', 'cloudflare'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'token', v_token,
    'license', jsonb_build_object(
      'licenseId', p_license_id::TEXT,
      'customerId', p_customer_id::TEXT,
      'product', 'minarvabiz',
      'edition', v_edition,
      'plan', v_plan,
      'features', p_features,
      'issuedAt', p_issued_at,
      'expiresAt', p_expires_at,
      'activationLimit', p_activation_limit,
      'deviceBindings', '[]'::jsonb,
      'customerName', v_customer_name
    ),
    'httpStatus', 200
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LICENSE_CONFLICT', 'httpStatus', 409);
  WHEN check_violation OR invalid_text_representation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST', 'httpStatus', 400);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE', 'httpStatus', 503);
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_issue_license(
  TEXT, UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER, JSONB, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_issue_license(
  TEXT, UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER, JSONB, TEXT, TEXT, TIMESTAMPTZ
) TO authenticated;
