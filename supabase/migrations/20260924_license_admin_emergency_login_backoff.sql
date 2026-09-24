-- Persistent progressive backoff for emergency license-admin shared-secret login.
-- Historical migrations are intentionally unchanged.

CREATE TABLE IF NOT EXISTS public.license_admin_login_backoff (
  key_hash TEXT PRIMARY KEY,
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0 AND failure_count <= 10000),
  blocked_until TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT license_admin_login_backoff_key_hash_format CHECK (key_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_license_admin_login_backoff_updated_at
  ON public.license_admin_login_backoff(updated_at);

ALTER TABLE public.license_admin_login_backoff ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.license_admin_login_backoff FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_license_admin_login_backoff(
  p_key_hash TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  failure_count INTEGER,
  retry_after_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_failure_count INTEGER := 0;
  v_blocked_until TIMESTAMPTZ;
  v_retry_after INTEGER := 0;
BEGIN
  IF p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid admin login backoff key' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.license_admin_login_backoff
  WHERE updated_at < v_now - interval '24 hours';

  SELECT b.failure_count, b.blocked_until
  INTO v_failure_count, v_blocked_until
  FROM public.license_admin_login_backoff b
  WHERE b.key_hash = p_key_hash;

  IF NOT FOUND THEN
    RETURN QUERY SELECT TRUE, 0, 0;
    RETURN;
  END IF;

  IF v_blocked_until IS NULL OR v_blocked_until <= v_now THEN
    RETURN QUERY SELECT TRUE, v_failure_count, 0;
    RETURN;
  END IF;

  v_retry_after := GREATEST(
    1,
    CEIL(EXTRACT(EPOCH FROM (v_blocked_until - v_now)))::INTEGER
  );
  RETURN QUERY SELECT FALSE, v_failure_count, v_retry_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_license_admin_login_failure(
  p_key_hash TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  failure_count INTEGER,
  retry_after_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_failure_count INTEGER;
  v_backoff_seconds INTEGER;
BEGIN
  IF p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid admin login backoff key' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.license_admin_login_backoff (
    key_hash, failure_count, blocked_until, last_failure_at, updated_at
  )
  VALUES (p_key_hash, 0, NULL, NULL, v_now)
  ON CONFLICT (key_hash) DO NOTHING;

  UPDATE public.license_admin_login_backoff
  SET
    failure_count = CASE
      WHEN last_failure_at IS NULL OR last_failure_at < v_now - interval '1 hour' THEN 1
      ELSE LEAST(failure_count + 1, 10000)
    END,
    last_failure_at = v_now,
    updated_at = v_now
  WHERE key_hash = p_key_hash
  RETURNING public.license_admin_login_backoff.failure_count
  INTO v_failure_count;

  v_backoff_seconds := LEAST(
    300,
    POWER(2::NUMERIC, LEAST(v_failure_count, 9))::INTEGER
  );

  UPDATE public.license_admin_login_backoff
  SET
    blocked_until = v_now + make_interval(secs => v_backoff_seconds),
    updated_at = v_now
  WHERE key_hash = p_key_hash;

  RETURN QUERY SELECT FALSE, v_failure_count, v_backoff_seconds;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_license_admin_login_failures(
  p_key_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid admin login backoff key' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.license_admin_login_backoff
  WHERE key_hash = p_key_hash;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.check_license_admin_login_backoff(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_license_admin_login_failure(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_license_admin_login_failures(TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_license_admin_login_backoff(TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_license_admin_login_failure(TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_license_admin_login_failures(TEXT)
  TO service_role;
