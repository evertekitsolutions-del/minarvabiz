-- Persistent rate limits for public licensing endpoints.
-- Historical migrations are intentionally unchanged.

CREATE TABLE IF NOT EXISTS public.license_api_rate_limits (
  bucket TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, key_hash),
  CONSTRAINT license_api_rate_limits_bucket_len CHECK (char_length(bucket) BETWEEN 1 AND 80),
  CONSTRAINT license_api_rate_limits_key_hash_format CHECK (key_hash ~ '^[0-9a-f]{64}$')
);

ALTER TABLE public.license_api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.license_api_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_license_rate_limit(
  p_bucket TEXT,
  p_key_hash TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_window_started_at TIMESTAMPTZ;
  v_request_count INTEGER;
  v_window INTERVAL;
BEGIN
  IF p_bucket IS NULL OR char_length(p_bucket) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Invalid rate-limit bucket' USING ERRCODE = '22023';
  END IF;
  IF p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid rate-limit key' USING ERRCODE = '22023';
  END IF;
  IF p_limit < 1 OR p_limit > 10000 OR p_window_seconds < 1 OR p_window_seconds > 604800 THEN
    RAISE EXCEPTION 'Invalid rate-limit window' USING ERRCODE = '22023';
  END IF;

  v_window := make_interval(secs => p_window_seconds);

  INSERT INTO public.license_api_rate_limits (
    bucket, key_hash, window_started_at, request_count, updated_at
  )
  VALUES (p_bucket, p_key_hash, v_now, 1, v_now)
  ON CONFLICT (bucket, key_hash) DO UPDATE
  SET
    request_count = CASE
      WHEN public.license_api_rate_limits.window_started_at <= v_now - v_window THEN 1
      ELSE public.license_api_rate_limits.request_count + 1
    END,
    window_started_at = CASE
      WHEN public.license_api_rate_limits.window_started_at <= v_now - v_window THEN v_now
      ELSE public.license_api_rate_limits.window_started_at
    END,
    updated_at = v_now
  RETURNING
    public.license_api_rate_limits.window_started_at,
    public.license_api_rate_limits.request_count
  INTO v_window_started_at, v_request_count;

  DELETE FROM public.license_api_rate_limits
  WHERE updated_at < v_now - interval '7 days';

  RETURN QUERY
  SELECT
    v_request_count <= p_limit,
    GREATEST(0, p_limit - v_request_count),
    v_window_started_at + v_window;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_license_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_license_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
  TO service_role;
