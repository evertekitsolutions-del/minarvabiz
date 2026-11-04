-- Emergency Admin trial inbox/conversion: require the same dual-authority proof as other business RPCs.
CREATE OR REPLACE FUNCTION public.cloudflare_admin_convert_trial_to_license(
  p_edge_secret TEXT,
  p_registration_id UUID,
  p_license_id UUID,
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
  v_trial public.trial_registrations%ROWTYPE;
  v_result JSONB;
  v_admin JSONB;
  v_permissions JSONB;
BEGIN
  v_admin := public.cloudflare_admin_me();
  IF COALESCE((v_admin ->> 'ok')::BOOLEAN, false) IS NOT TRUE THEN
    RETURN v_admin;
  END IF;
  v_permissions := COALESCE(v_admin -> 'permissions', '[]'::jsonb);
  IF NOT (v_permissions ? 'license.issue') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'httpStatus', 403);
  END IF;

  IF p_registration_id IS NULL OR p_license_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST', 'httpStatus', 400);
  END IF;

  IF p_plan NOT IN ('basic', 'professional', 'business', 'enterprise') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST', 'httpStatus', 400);
  END IF;

  SELECT *
    INTO v_trial
    FROM public.trial_registrations
   WHERE id = p_registration_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'httpStatus', 404);
  END IF;

  IF v_trial.status = 'converted' OR v_trial.converted_license_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TRIAL_ALREADY_CONVERTED', 'httpStatus', 409);
  END IF;

  IF v_trial.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TRIAL_REVOKED', 'httpStatus', 409);
  END IF;

  v_result := public.cloudflare_admin_issue_license(
    p_edge_secret,
    p_license_id,
    p_registration_id,
    v_trial.organization_name,
    p_plan,
    p_edition,
    p_expires_at,
    p_activation_limit,
    p_features,
    p_token,
    p_token_sha256,
    p_issued_at
  );

  IF COALESCE((v_result ->> 'ok')::BOOLEAN, false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  UPDATE public.trial_registrations
     SET status = 'converted',
         converted_license_id = p_license_id::TEXT,
         converted_at = clock_timestamp()
   WHERE id = p_registration_id;

  RETURN v_result || jsonb_build_object(
    'trialRegistrationId', p_registration_id,
    'convertedAt', (SELECT converted_at FROM public.trial_registrations WHERE id = p_registration_id)
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TRIAL_ALREADY_CONVERTED', 'httpStatus', 409);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE', 'httpStatus', 503);
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_convert_trial_to_license(
  TEXT, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, INTEGER, JSONB, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_convert_trial_to_license(
  TEXT, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, INTEGER, JSONB, TEXT, TEXT, TIMESTAMPTZ
) TO authenticated;

-- The Cloudflare emergency-admin gateway authenticates with the anon key,
-- an edge-secret proof and a live, revocable emergency session. These
-- SECURITY DEFINER functions authorize via cloudflare_admin_me() before any data read.
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_list_trial_registrations()
  TO anon;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_convert_trial_to_license(
  TEXT, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, INTEGER, JSONB, TEXT, TEXT, TIMESTAMPTZ
) TO anon;
