-- Cloudflare-native trial registration bridge.
-- No email provider is required in the zero-cost phase; registrations are recorded as email-pending.

CREATE OR REPLACE FUNCTION public.cloudflare_register_trial(
  p_edge_secret TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_organization_name TEXT,
  p_address TEXT,
  p_device_id TEXT,
  p_client_ip TEXT DEFAULT 'unknown'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_expires TIMESTAMPTZ := v_now + interval '30 days';
  v_secret_hash TEXT;
  v_email TEXT;
  v_phone TEXT;
  v_org TEXT;
  v_address TEXT;
  v_device_id TEXT;
  v_client_ip TEXT;
  v_ip_hash TEXT;
  v_device_hash TEXT;
  v_rate RECORD;
  v_existing RECORD;
  v_registration_id UUID := gen_random_uuid();
  v_retry_after INTEGER;
BEGIN
  IF p_edge_secret IS NULL OR char_length(p_edge_secret) < 32 OR char_length(p_edge_secret) > 512 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trial registration is temporarily unavailable.', 'httpStatus', 503);
  END IF;

  v_secret_hash := encode(extensions.digest(p_edge_secret, 'sha256'), 'hex');
  IF NOT EXISTS (
    SELECT 1
    FROM license_private.edge_credentials c
    WHERE c.active = true
      AND c.secret_sha256 = v_secret_hash
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trial registration is temporarily unavailable.', 'httpStatus', 503);
  END IF;

  v_email := lower(btrim(COALESCE(p_email, '')));
  v_phone := btrim(COALESCE(p_phone, ''));
  v_org := btrim(COALESCE(p_organization_name, ''));
  v_address := btrim(COALESCE(p_address, ''));
  v_device_id := lower(btrim(COALESCE(p_device_id, '')));
  v_client_ip := left(btrim(COALESCE(p_client_ip, 'unknown')), 200);

  IF char_length(v_email) < 3
     OR char_length(v_email) > 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A valid email address is required.', 'httpStatus', 400);
  END IF;
  IF char_length(v_phone) < 6
     OR char_length(v_phone) > 50
     OR v_phone !~ '^\+?[0-9]{6,50}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A valid phone number is required.', 'httpStatus', 400);
  END IF;
  IF char_length(v_org) < 1 OR char_length(v_org) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Organization name is required.', 'httpStatus', 400);
  END IF;
  IF char_length(v_address) < 1 OR char_length(v_address) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Address is required.', 'httpStatus', 400);
  END IF;
  IF v_device_id !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Device registration is required.', 'httpStatus', 400);
  END IF;

  v_ip_hash := encode(
    extensions.digest(COALESCE(NULLIF(v_client_ip, ''), 'unknown') || '|' || v_secret_hash, 'sha256'),
    'hex'
  );
  SELECT *
  INTO v_rate
  FROM public.consume_license_rate_limit('trial-register-ip', v_ip_hash, 10, 60 * 60);

  IF NOT COALESCE(v_rate.allowed, false) THEN
    v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_rate.reset_at - v_now)))::INTEGER);
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'RATE_LIMITED',
      'error', 'Too many trial registration attempts.',
      'httpStatus', 429,
      'retryAfterSeconds', v_retry_after
    );
  END IF;

  v_device_hash := encode(
    extensions.digest(v_device_id || '|' || v_secret_hash, 'sha256'),
    'hex'
  );
  SELECT *
  INTO v_rate
  FROM public.consume_license_rate_limit('trial-register-device', v_device_hash, 3, 24 * 60 * 60);

  IF NOT COALESCE(v_rate.allowed, false) THEN
    v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_rate.reset_at - v_now)))::INTEGER);
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'RATE_LIMITED',
      'error', 'Too many trial registration attempts for this device.',
      'httpStatus', 429,
      'retryAfterSeconds', v_retry_after
    );
  END IF;

  SELECT
    t.id,
    t.status,
    t.trial_started_at,
    t.trial_expires_at
  INTO v_existing
  FROM public.trial_registrations t
  WHERE lower(t.email) = v_email
     OR t.phone = v_phone
     OR t.device_id = v_device_id
  ORDER BY t.created_at ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'TRIAL_ALREADY_REGISTERED',
      'error', 'A Minarva Biz trial is already registered for this email, phone number, or device.',
      'trial', jsonb_build_object(
        'id', v_existing.id,
        'status', v_existing.status,
        'trial_started_at', v_existing.trial_started_at,
        'trial_expires_at', v_existing.trial_expires_at
      ),
      'httpStatus', 409
    );
  END IF;

  BEGIN
    INSERT INTO public.trial_registrations (
      id,
      email,
      phone,
      organization_name,
      address,
      device_id,
      status,
      trial_started_at,
      trial_expires_at
    )
    VALUES (
      v_registration_id,
      v_email,
      v_phone,
      v_org,
      v_address,
      v_device_id,
      'registered_email_pending',
      v_now,
      v_expires
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'TRIAL_ALREADY_REGISTERED',
        'error', 'A Minarva Biz trial is already registered for this email, phone number, or device.',
        'httpStatus', 409
      );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'emailQueued', false,
    'registrationId', v_registration_id,
    'trialStartedAt', v_now,
    'trialExpiresAt', v_expires,
    'httpStatus', 200
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Could not register the trial.', 'httpStatus', 500);
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_register_trial(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_register_trial(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO anon;
