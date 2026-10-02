-- Cloudflare-native read-only License Admin registry.
-- Reuses cloudflare_admin_me() as the single MFA/allowlist/RBAC authority.

CREATE OR REPLACE FUNCTION public.cloudflare_admin_list_licenses()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin JSONB;
  v_permissions JSONB;
  v_licenses JSONB;
BEGIN
  v_admin := public.cloudflare_admin_me();
  IF COALESCE((v_admin ->> 'ok')::BOOLEAN, false) IS NOT TRUE THEN
    RETURN v_admin;
  END IF;

  v_permissions := COALESCE(v_admin -> 'permissions', '[]'::jsonb);
  IF NOT (v_permissions ? 'license.read') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'license_id', l.license_id,
        'customer_id', l.customer_id,
        'product', l.product,
        'edition', l.edition,
        'plan', l.plan,
        'status', l.status,
        'issued_at', l.issued_at,
        'expires_at', l.expires_at,
        'activation_limit', l.activation_limit,
        'features', l.features,
        'metadata', l.metadata,
        'created_at', l.created_at,
        'updated_at', l.updated_at,
        'activations', COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'activation_id', a.activation_id,
                'device_id', a.device_id,
                'status', a.status,
                'activated_at', a.activated_at,
                'deactivated_at', a.deactivated_at,
                'last_validated_at', a.last_validated_at
              )
              ORDER BY a.activated_at DESC
            )
            FROM public.license_activations a
            WHERE a.license_id = l.id
          ),
          '[]'::jsonb
        )
      )
      ORDER BY l.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_licenses
  FROM (
    SELECT *
    FROM public.licenses
    ORDER BY created_at DESC
    LIMIT 200
  ) l;

  RETURN jsonb_build_object(
    'ok', true,
    'identity', v_admin -> 'identity',
    'licenses', v_licenses
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_list_licenses()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_list_licenses()
  TO authenticated;
