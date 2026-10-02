-- Cloudflare-native license deactivation bridge.
-- Reuses the private edge credential established by the validation bridge.

CREATE OR REPLACE FUNCTION public.cloudflare_deactivate_license(
  p_edge_secret TEXT,
  p_license_token TEXT,
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
  v_secret_hash TEXT;
  v_token TEXT;
  v_token_hash TEXT;
  v_device_id TEXT;
  v_client_ip TEXT;
  v_ip_hash TEXT;
  v_device_hash TEXT;
  v_rate RECORD;
  v_license RECORD;
  v_activation RECORD;
  v_retry_after INTEGER;
BEGIN
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

  v_token := btrim(COALESCE(p_license_token, ''));
  v_device_id := lower(btrim(COALESCE(p_device_id, '')));
  v_client_ip := left(btrim(COALESCE(p_client_ip, 'unknown')), 200);

  IF char_length(v_token) < 1
     OR char_length(v_token) > 2000
     OR v_device_id !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST', 'httpStatus', 400);
  END IF;

  v_ip_hash := encode(
    extensions.digest(COALESCE(NULLIF(v_client_ip, ''), 'unknown') || '|' || v_secret_hash, 'sha256'),
    'hex'
  );
  SELECT *
  INTO v_rate
  FROM public.consume_license_rate_limit('license-deactivate-ip', v_ip_hash, 60, 15 * 60);

  IF NOT COALESCE(v_rate.allowed, false) THEN
    v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_rate.reset_at - v_now)))::INTEGER);
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'RATE_LIMITED',
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
  FROM public.consume_license_rate_limit('license-deactivate-device', v_device_hash, 10, 15 * 60);

  IF NOT COALESCE(v_rate.allowed, false) THEN
    v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_rate.reset_at - v_now)))::INTEGER);
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'RATE_LIMITED',
      'httpStatus', 429,
      'retryAfterSeconds', v_retry_after
    );
  END IF;

  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  SELECT l.id, l.license_id
  INTO v_license
  FROM public.licenses l
  WHERE l.token_sha256 = v_token_hash
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_LICENSE', 'httpStatus', 401);
  END IF;

  SELECT a.id, a.activation_id
  INTO v_activation
  FROM public.license_activations a
  WHERE a.license_id = v_license.id
    AND a.device_id = v_device_id
    AND a.status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'DEVICE_NOT_ACTIVATED',
      'httpStatus', 404
    );
  END IF;

  UPDATE public.license_activations
  SET
    status = 'deactivated',
    deactivated_at = v_now
  WHERE id = v_activation.id;

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
    v_activation.id,
    'deactivated',
    v_device_id,
    'desktop',
    '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'deactivated',
    'licenseId', v_license.license_id,
    'activationId', v_activation.activation_id,
    'deactivatedAt', v_now,
    'httpStatus', 200
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SERVICE_ERROR', 'httpStatus', 503);
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_deactivate_license(TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_deactivate_license(TEXT, TEXT, TEXT, TEXT)
  TO anon;
