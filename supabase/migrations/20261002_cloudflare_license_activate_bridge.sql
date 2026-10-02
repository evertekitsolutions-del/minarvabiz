-- Cloudflare-ready commercial license activation bridge.
-- The Worker must verify that its existing production Ed25519 signing seed matches
-- the shipped production public key before calling this RPC.

CREATE OR REPLACE FUNCTION public.cloudflare_prepare_license_activation(
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
  v_error TEXT;
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
  FROM public.consume_license_rate_limit('license-activate-ip', v_ip_hash, 30, 15 * 60);

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
  FROM public.consume_license_rate_limit('license-activate-device', v_device_hash, 10, 15 * 60);

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

  SELECT
    l.id,
    l.license_id,
    l.customer_id,
    l.product,
    l.edition,
    l.plan,
    l.status,
    l.expires_at,
    l.activation_limit,
    l.features
  INTO v_license
  FROM public.licenses l
  WHERE l.token_sha256 = v_token_hash
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_LICENSE', 'httpStatus', 401);
  END IF;

  IF v_license.product <> 'minarvabiz' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PRODUCT', 'httpStatus', 403);
  END IF;

  IF v_license.status <> 'active' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', upper(COALESCE(v_license.status, 'inactive')),
      'httpStatus', 403
    );
  END IF;

  IF v_license.expires_at IS NOT NULL AND v_license.expires_at <= v_now THEN
    UPDATE public.licenses
    SET status = 'expired', updated_at = v_now
    WHERE id = v_license.id;

    RETURN jsonb_build_object('ok', false, 'code', 'EXPIRED', 'httpStatus', 403);
  END IF;

  BEGIN
    SELECT *
    INTO v_activation
    FROM public.activate_license_device(v_license.id, v_device_id)
    LIMIT 1;
  EXCEPTION
    WHEN OTHERS THEN
      v_error := SQLERRM;
      IF v_error LIKE '%ACTIVATION_LIMIT_REACHED%' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ACTIVATION_LIMIT_REACHED', 'httpStatus', 409);
      ELSIF v_error LIKE '%LICENSE_EXPIRED%' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'EXPIRED', 'httpStatus', 403);
      ELSIF v_error LIKE '%LICENSE_NOT_ACTIVE%' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'LICENSE_NOT_ACTIVE', 'httpStatus', 403);
      ELSIF v_error LIKE '%INVALID_DEVICE_ID%' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST', 'httpStatus', 400);
      ELSE
        RETURN jsonb_build_object('ok', false, 'code', 'ACTIVATION_FAILED', 'httpStatus', 409);
      END IF;
  END;

  IF v_activation.activation_id IS NULL OR v_activation.activation_row_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ACTIVATION_FAILED', 'httpStatus', 409);
  END IF;

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
    v_activation.activation_row_id,
    'activated',
    v_device_id,
    'desktop',
    jsonb_build_object('activationId', v_activation.activation_id, 'authority', 'cloudflare')
  );

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'active',
    'licenseId', v_license.license_id,
    'customerId', v_license.customer_id,
    'activationId', v_activation.activation_id,
    'plan', v_license.plan,
    'edition', v_license.edition,
    'expiresAt', v_license.expires_at,
    'features', v_license.features,
    'validatedAt', v_now,
    'httpStatus', 200
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SERVICE_ERROR', 'httpStatus', 503);
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_prepare_license_activation(TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_prepare_license_activation(TEXT, TEXT, TEXT, TEXT)
  TO anon;
