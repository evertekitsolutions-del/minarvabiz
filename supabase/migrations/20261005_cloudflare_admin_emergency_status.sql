-- Cloudflare emergency route status bridge.
-- Exposes only safe configuration state; emergency credential digests remain private.

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
  v_current_configured BOOLEAN := false;
  v_previous_active BOOLEAN := false;
BEGIN
  IF NOT license_private.cloudflare_edge_secret_valid(p_edge_secret) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMERGENCY_SERVICE_UNAVAILABLE',
      'httpStatus', 503
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM license_private.admin_emergency_credentials c
    WHERE c.slot = 'current'
      AND c.active = true
  )
  INTO v_current_configured;

  SELECT EXISTS (
    SELECT 1
    FROM license_private.admin_emergency_credentials c
    WHERE c.slot = 'previous'
      AND c.active = true
      AND c.valid_until > v_now
      AND c.valid_until <= c.created_at + interval '24 hours'
  )
  INTO v_previous_active;

  RETURN jsonb_build_object(
    'ok', true,
    'currentConfigured', v_current_configured,
    'previousActive', v_previous_active,
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

REVOKE ALL ON FUNCTION public.cloudflare_admin_emergency_status(TEXT)
  FROM PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_emergency_status(TEXT)
  TO anon;
