-- Cloudflare-native online customer provisioning.
-- Uses public Supabase Magic Link signup at the edge, while Postgres owns
-- admin authorization, preflight conflict checks, tenant verification, and audit.
-- Remove the historical typo trigger so each new Auth user bootstraps exactly one tenant.

DROP TRIGGER IF EXISTS on_auth_user_created_minvarva_org ON auth.users;

CREATE OR REPLACE FUNCTION public.cloudflare_admin_preflight_customer_provision(
  p_email TEXT,
  p_shop_name TEXT,
  p_admin_name TEXT
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
  v_email TEXT := lower(btrim(COALESCE(p_email, '')));
  v_shop_name TEXT := btrim(COALESCE(p_shop_name, ''));
  v_admin_name TEXT := btrim(COALESCE(p_admin_name, ''));
  v_user RECORD;
  v_membership_count INTEGER := 0;
  v_hq_count INTEGER := 0;
  v_org_id UUID;
  v_display_name TEXT;
BEGIN
  v_admin := public.cloudflare_admin_me();
  IF COALESCE((v_admin ->> 'ok')::BOOLEAN, false) IS NOT TRUE THEN
    RETURN v_admin;
  END IF;

  v_permissions := COALESCE(v_admin -> 'permissions', '[]'::jsonb);
  IF NOT (v_permissions ? 'customer.provision') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'httpStatus', 403);
  END IF;

  IF char_length(v_email) < 3
     OR char_length(v_email) > 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR char_length(v_shop_name) < 1
     OR char_length(v_shop_name) > 200
     OR char_length(v_admin_name) < 1
     OR char_length(v_admin_name) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST', 'httpStatus', 400);
  END IF;

  v_identity := v_admin -> 'identity';
  v_display_name := COALESCE(
    NULLIF(v_identity ->> 'displayName', ''),
    NULLIF(v_identity ->> 'email', ''),
    'Minarva Biz Administrator'
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
    'online_customer.provision',
    'attempted',
    'online_customer',
    v_email,
    jsonb_build_object(
      'shopName', v_shop_name,
      'email', v_email,
      'authority', 'cloudflare'
    )
  );

  SELECT
    u.id,
    u.raw_user_meta_data
  INTO v_user
  FROM auth.users u
  WHERE lower(u.email) = v_email
  ORDER BY u.created_at ASC
  LIMIT 1;

  IF FOUND THEN
    SELECT
      count(*)::INTEGER,
      min(om.org_id)
    INTO v_membership_count, v_org_id
    FROM public.organization_members om
    WHERE om.user_id = v_user.id;

    IF v_membership_count = 1 AND v_org_id IS NOT NULL THEN
      SELECT count(*)::INTEGER
      INTO v_hq_count
      FROM public.branches b
      WHERE b.org_id = v_org_id
        AND b.is_headquarters = true
        AND b.is_active = true;

      IF v_hq_count = 1 THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'CUSTOMER_ALREADY_EXISTS',
          'userId', v_user.id,
          'orgId', v_org_id,
          'httpStatus', 409
        );
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'CUSTOMER_REVIEW_REQUIRED',
      'userId', v_user.id,
      'httpStatus', 409
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'email', v_email,
    'shopName', v_shop_name,
    'adminName', v_admin_name,
    'httpStatus', 200
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_preflight_customer_provision(TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_preflight_customer_provision(TEXT, TEXT, TEXT)
  TO authenticated;


CREATE OR REPLACE FUNCTION public.cloudflare_admin_finalize_customer_provision(
  p_email TEXT,
  p_shop_name TEXT,
  p_admin_name TEXT,
  p_redirect_to TEXT,
  p_upstream_error TEXT DEFAULT NULL
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
  v_email TEXT := lower(btrim(COALESCE(p_email, '')));
  v_shop_name TEXT := btrim(COALESCE(p_shop_name, ''));
  v_admin_name TEXT := btrim(COALESCE(p_admin_name, ''));
  v_redirect_to TEXT := btrim(COALESCE(p_redirect_to, ''));
  v_upstream_error TEXT := NULLIF(btrim(COALESCE(p_upstream_error, '')), '');
  v_user RECORD;
  v_membership_count INTEGER := 0;
  v_hq_count INTEGER := 0;
  v_org_id UUID;
  v_display_name TEXT;
  v_message TEXT;
BEGIN
  v_admin := public.cloudflare_admin_me();
  IF COALESCE((v_admin ->> 'ok')::BOOLEAN, false) IS NOT TRUE THEN
    RETURN v_admin;
  END IF;

  v_permissions := COALESCE(v_admin -> 'permissions', '[]'::jsonb);
  IF NOT (v_permissions ? 'customer.provision') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'httpStatus', 403);
  END IF;

  IF char_length(v_email) < 3
     OR char_length(v_email) > 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR char_length(v_shop_name) < 1
     OR char_length(v_shop_name) > 200
     OR char_length(v_admin_name) < 1
     OR char_length(v_admin_name) > 200
     OR char_length(v_redirect_to) < 1
     OR char_length(v_redirect_to) > 1000
     OR (v_upstream_error IS NOT NULL AND char_length(v_upstream_error) > 500) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST', 'httpStatus', 400);
  END IF;

  v_identity := v_admin -> 'identity';
  v_display_name := COALESCE(
    NULLIF(v_identity ->> 'displayName', ''),
    NULLIF(v_identity ->> 'email', ''),
    'Minarva Biz Administrator'
  );

  IF v_upstream_error IS NOT NULL THEN
    INSERT INTO public.license_admin_audit_log (
      id, session_id, actor_id, actor_email, display_name, actor_role,
      source, action, outcome, target_type, target_id, details
    )
    VALUES (
      gen_random_uuid(),
      NULL,
      COALESCE(v_identity ->> 'id', ''),
      COALESCE(v_identity ->> 'email', ''),
      left(v_display_name, 120),
      COALESCE(v_identity ->> 'role', ''),
      'supabase',
      'online_customer.provision',
      'error',
      'online_customer',
      v_email,
      jsonb_build_object(
        'shopName', v_shop_name,
        'email', v_email,
        'message', v_upstream_error,
        'authority', 'cloudflare'
      )
    );

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PROVISION_EMAIL_FAILED',
      'error', v_upstream_error,
      'httpStatus', 502
    );
  END IF;

  SELECT
    u.id,
    u.raw_user_meta_data
  INTO v_user
  FROM auth.users u
  WHERE lower(u.email) = v_email
  ORDER BY u.created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    v_message := 'Magic Link request succeeded, but the new Auth user was not found.';
  ELSIF COALESCE(v_user.raw_user_meta_data ->> 'full_name', '') <> v_admin_name
     OR COALESCE(v_user.raw_user_meta_data ->> 'shop_name', '') <> v_shop_name THEN
    v_message := 'Auth user metadata does not match the requested customer bootstrap.';
  ELSE
    SELECT
      count(*)::INTEGER,
      min(om.org_id)
    INTO v_membership_count, v_org_id
    FROM public.organization_members om
    WHERE om.user_id = v_user.id;

    IF v_membership_count <> 1 OR v_org_id IS NULL THEN
      v_message := 'Customer organization membership bootstrap did not complete exactly once.';
    ELSE
      SELECT count(*)::INTEGER
      INTO v_hq_count
      FROM public.branches b
      WHERE b.org_id = v_org_id
        AND b.is_headquarters = true
        AND b.is_active = true;

      IF v_hq_count <> 1 THEN
        v_message := 'Customer headquarters branch bootstrap did not complete exactly once.';
      END IF;
    END IF;
  END IF;

  IF v_message IS NOT NULL THEN
    INSERT INTO public.license_admin_audit_log (
      id, session_id, actor_id, actor_email, display_name, actor_role,
      source, action, outcome, target_type, target_id, details
    )
    VALUES (
      gen_random_uuid(),
      NULL,
      COALESCE(v_identity ->> 'id', ''),
      COALESCE(v_identity ->> 'email', ''),
      left(v_display_name, 120),
      COALESCE(v_identity ->> 'role', ''),
      'supabase',
      'online_customer.provision',
      'error',
      'online_customer',
      COALESCE(v_user.id::TEXT, v_email),
      jsonb_build_object(
        'shopName', v_shop_name,
        'email', v_email,
        'userId', CASE WHEN v_user.id IS NULL THEN NULL ELSE v_user.id::TEXT END,
        'orgId', CASE WHEN v_org_id IS NULL THEN NULL ELSE v_org_id::TEXT END,
        'message', v_message,
        'authority', 'cloudflare'
      )
    );

    RETURN jsonb_build_object(
      'ok', false,
      'partial', true,
      'code', 'PROVISION_VERIFY_FAILED',
      'error', v_message,
      'httpStatus', 409
    );
  END IF;

  INSERT INTO public.license_admin_audit_log (
    id, session_id, actor_id, actor_email, display_name, actor_role,
    source, action, outcome, target_type, target_id, details
  )
  VALUES (
    gen_random_uuid(),
    NULL,
    COALESCE(v_identity ->> 'id', ''),
    COALESCE(v_identity ->> 'email', ''),
    left(v_display_name, 120),
    COALESCE(v_identity ->> 'role', ''),
    'supabase',
    'online_customer.provision',
    'success',
    'online_customer',
    v_user.id::TEXT,
    jsonb_build_object(
      'shopName', v_shop_name,
      'email', v_email,
      'userId', v_user.id,
      'orgId', v_org_id,
      'redirectTo', v_redirect_to,
      'authority', 'cloudflare'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'email', v_email,
    'userId', v_user.id,
    'orgId', v_org_id,
    'message', 'Online customer created. Magic Link sent.',
    'httpStatus', 200
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_finalize_customer_provision(TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_finalize_customer_provision(TEXT, TEXT, TEXT, TEXT, TEXT)
  TO authenticated;
