-- Authenticated, read-only inbox for trial registrations.
-- Uses the existing MFA-backed admin identity and license.read permission.

CREATE OR REPLACE FUNCTION public.cloudflare_admin_list_trial_registrations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin JSONB;
  v_permissions JSONB;
  v_trials JSONB;
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
        'id', t.id,
        'email', t.email,
        'phone', t.phone,
        'organization_name', t.organization_name,
        'address', t.address,
        'device_id', t.device_id,
        'status', t.status,
        'trial_started_at', t.trial_started_at,
        'trial_expires_at', t.trial_expires_at,
        'created_at', t.created_at
      )
      ORDER BY t.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_trials
  FROM (
    SELECT *
    FROM public.trial_registrations
    ORDER BY created_at DESC
    LIMIT 200
  ) t;

  RETURN jsonb_build_object(
    'ok', true,
    'registrations', v_trials
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_list_trial_registrations()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_list_trial_registrations()
  TO authenticated;
