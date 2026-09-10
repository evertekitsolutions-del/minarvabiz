-- Make license activation limits database-safe and race-free.
-- Enterprise uses -1 for unlimited devices.

ALTER TABLE licenses DROP CONSTRAINT IF EXISTS licenses_activation_limit_check;
ALTER TABLE licenses
  ADD CONSTRAINT licenses_activation_limit_check
  CHECK (activation_limit = -1 OR activation_limit > 0);

CREATE OR REPLACE FUNCTION public.activate_license_device(
  p_license_id UUID,
  p_device_id TEXT
)
RETURNS TABLE (
  activation_id TEXT,
  activation_row_id UUID,
  status TEXT,
  activated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_license licenses%ROWTYPE;
  v_existing license_activations%ROWTYPE;
  v_existing_found BOOLEAN := FALSE;
  v_active_count INTEGER;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF p_device_id IS NULL OR p_device_id !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_DEVICE_ID';
  END IF;

  SELECT * INTO v_license
    FROM licenses
   WHERE id = p_license_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LICENSE_NOT_FOUND';
  END IF;

  IF v_license.product <> 'minarvabiz' THEN
    RAISE EXCEPTION 'INVALID_PRODUCT';
  END IF;

  IF v_license.status <> 'active' THEN
    RAISE EXCEPTION 'LICENSE_NOT_ACTIVE:%', v_license.status;
  END IF;

  IF v_license.expires_at IS NOT NULL AND v_license.expires_at <= v_now THEN
    UPDATE licenses SET status = 'expired', updated_at = v_now WHERE id = v_license.id;
    RAISE EXCEPTION 'LICENSE_EXPIRED';
  END IF;

  SELECT * INTO v_existing
    FROM license_activations
   WHERE license_id = v_license.id
     AND device_id = p_device_id
   FOR UPDATE;
  v_existing_found := FOUND;

  IF v_existing_found AND v_existing.status = 'active' THEN
    UPDATE license_activations
       SET last_validated_at = v_now
     WHERE id = v_existing.id;
    RETURN QUERY SELECT v_existing.activation_id, v_existing.id, 'active'::TEXT, v_existing.activated_at;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_active_count
    FROM license_activations
   WHERE license_id = v_license.id
     AND status = 'active';

  IF v_license.activation_limit <> -1 AND v_active_count >= v_license.activation_limit THEN
    RAISE EXCEPTION 'ACTIVATION_LIMIT_REACHED';
  END IF;

  IF v_existing_found THEN
    UPDATE license_activations
       SET status = 'active', activated_at = v_now, deactivated_at = NULL, last_validated_at = v_now
     WHERE id = v_existing.id
     RETURNING * INTO v_existing;
    RETURN QUERY SELECT v_existing.activation_id, v_existing.id, 'active'::TEXT, v_existing.activated_at;
    RETURN;
  END IF;

  INSERT INTO license_activations (
    id, license_id, activation_id, device_id, status, activated_at, last_validated_at
  ) VALUES (
    gen_random_uuid(), v_license.id, gen_random_uuid()::TEXT, p_device_id, 'active', v_now, v_now
  )
  RETURNING * INTO v_existing;

  RETURN QUERY SELECT v_existing.activation_id, v_existing.id, 'active'::TEXT, v_existing.activated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_license_device(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_license_device(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.activate_license_device(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.activate_license_device(UUID, TEXT) TO service_role;
