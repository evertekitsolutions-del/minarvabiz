-- Dual License Admin authorization boundary.
-- Existing named administrators keep Supabase Auth + AAL2.
-- Emergency sessions may reuse the same Cloudflare admin business RPCs only when
-- the Worker presents BOTH its private edge secret and the SHA-256 digest of a
-- live, revocable emergency bearer session. Browser callers never receive the
-- edge secret.

CREATE OR REPLACE FUNCTION license_private.cloudflare_admin_emergency_authority(
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
  v_permissions JSONB := jsonb_build_array(
    'license.read',
    'license.issue',
    'license.offline_activate',
    'license.status_manage',
    'customer.provision',
    'support.read',
    'support.manage'
  );
BEGIN
  IF NOT license_private.cloudflare_edge_secret_valid(p_edge_secret) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  END IF;

  IF p_token_sha256 IS NULL OR p_token_sha256 !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
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
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
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
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
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
    'permissions', v_permissions,
    'sessionId', v_session.id,
    'expiresAt', v_session.expires_at
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
END;
$$;

REVOKE ALL ON FUNCTION license_private.cloudflare_admin_emergency_authority(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cloudflare_admin_me()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_claims JSONB := auth.jwt();
  v_aal TEXT := COALESCE(v_claims ->> 'aal', '');
  v_email TEXT := lower(COALESCE(v_claims ->> 'email', ''));
  v_identity RECORD;
  v_permissions JSONB;
  v_headers JSONB := '{}'::jsonb;
  v_edge_secret TEXT := '';
  v_emergency_token_sha256 TEXT := '';
  v_emergency JSONB;
BEGIN
  IF v_uid IS NULL THEN
    BEGIN
      v_headers := COALESCE(
        NULLIF(pg_catalog.current_setting('request.headers', true), ''),
        '{}'
      )::jsonb;
    EXCEPTION
      WHEN OTHERS THEN
        v_headers := '{}'::jsonb;
    END;

    v_edge_secret := COALESCE(v_headers ->> 'x-minarva-edge-secret', '');
    v_emergency_token_sha256 :=
      lower(COALESCE(v_headers ->> 'x-minarva-emergency-token-sha256', ''));

    v_emergency :=
      license_private.cloudflare_admin_emergency_authority(
        v_edge_secret,
        v_emergency_token_sha256
      );

    IF COALESCE((v_emergency ->> 'ok')::BOOLEAN, false) IS TRUE THEN
      RETURN v_emergency;
    END IF;

    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  END IF;

  IF v_aal <> 'aal2' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MFA_REQUIRED');
  END IF;

  SELECT
    i.auth_user_id,
    i.email,
    i.display_name,
    i.status,
    i.role
  INTO v_identity
  FROM public.license_admin_identities i
  WHERE i.auth_user_id = v_uid
    AND i.status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_NOT_ALLOWED');
  END IF;

  IF v_email = '' OR lower(v_identity.email) <> v_email THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_IDENTITY_MISMATCH');
  END IF;

  IF v_identity.role = 'viewer' THEN
    v_permissions := jsonb_build_array(
      'license.read',
      'support.read'
    );
  ELSIF v_identity.role = 'operator' THEN
    v_permissions := jsonb_build_array(
      'license.read',
      'license.issue',
      'license.offline_activate',
      'customer.provision',
      'support.read',
      'support.manage'
    );
  ELSIF v_identity.role = 'admin' THEN
    v_permissions := jsonb_build_array(
      'license.read',
      'license.issue',
      'license.offline_activate',
      'license.status_manage',
      'customer.provision',
      'support.read',
      'support.manage'
    );
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_ROLE_INVALID');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'identity', jsonb_build_object(
      'id', v_identity.auth_user_id,
      'email', lower(v_identity.email),
      'displayName', v_identity.display_name,
      'role', v_identity.role,
      'source', 'supabase'
    ),
    'permissions', v_permissions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_me()
  FROM PUBLIC, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_me()
  TO anon, authenticated;

-- Emergency callers use the same business RPC implementations through the
-- hardened cloudflare_admin_me() boundary. Direct anon calls without both
-- Worker edge proof + a live emergency session fail closed.
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_list_licenses()
  TO anon;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_issue_license(
  TEXT, UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER, JSONB, TEXT, TEXT, TIMESTAMPTZ
) TO anon;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_set_license_status(TEXT, TEXT)
  TO anon;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_prepare_offline_activation(TEXT, TEXT)
  TO anon;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_list_support_requests()
  TO anon;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_update_support_request(UUID, TEXT, TEXT, TEXT)
  TO anon;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_preflight_customer_provision(TEXT, TEXT, TEXT)
  TO anon;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_finalize_customer_provision(
  TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon;

CREATE OR REPLACE FUNCTION private.normalize_cloudflare_emergency_admin_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_headers JSONB := '{}'::jsonb;
  v_edge_secret TEXT := '';
  v_token_sha256 TEXT := '';
  v_authority JSONB;
  v_identity JSONB;
  v_session_id TEXT;
BEGIN
  BEGIN
    v_headers := COALESCE(
      NULLIF(pg_catalog.current_setting('request.headers', true), ''),
      '{}'
    )::jsonb;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NEW;
  END;

  v_edge_secret := COALESCE(v_headers ->> 'x-minarva-edge-secret', '');
  v_token_sha256 :=
    lower(COALESCE(v_headers ->> 'x-minarva-emergency-token-sha256', ''));

  IF v_edge_secret = '' OR v_token_sha256 = '' THEN
    RETURN NEW;
  END IF;

  v_authority :=
    license_private.cloudflare_admin_emergency_authority(
      v_edge_secret,
      v_token_sha256
    );

  IF COALESCE((v_authority ->> 'ok')::BOOLEAN, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_identity := COALESCE(v_authority -> 'identity', '{}'::jsonb);
  v_session_id := COALESCE(v_authority ->> 'sessionId', '');

  IF v_session_id ~ '^[0-9a-f-]{36}$' THEN
    NEW.session_id := v_session_id::uuid;
  END IF;
  NEW.actor_id := COALESCE(NULLIF(v_identity ->> 'id', ''), NEW.actor_id);
  NEW.actor_email := COALESCE(NULLIF(v_identity ->> 'email', ''), NEW.actor_email);
  NEW.display_name := COALESCE(NULLIF(v_identity ->> 'displayName', ''), NEW.display_name);
  NEW.actor_role := 'admin';
  NEW.source := 'emergency';

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.normalize_cloudflare_emergency_admin_audit()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS license_admin_audit_emergency_context
  ON public.license_admin_audit_log;
CREATE TRIGGER license_admin_audit_emergency_context
BEFORE INSERT ON public.license_admin_audit_log
FOR EACH ROW
EXECUTE FUNCTION private.normalize_cloudflare_emergency_admin_audit();
