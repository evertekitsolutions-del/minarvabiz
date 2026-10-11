-- HR-004C: server-owned UTC shift interval and minimum-rest primitives.
--
-- These functions deliberately do not change staff_roster_guard(), elevate
-- DRAFT policies to APPROVED, or write any roster, history or audit rows.
-- Callers must resolve a tenant-authorized, approved branch policy before
-- calling these internal-only helpers in a later rollout.
-- PostgreSQL + IANA timezone data only: no provider-specific dependencies.
CREATE OR REPLACE FUNCTION public.roster_shift_utc_window(
  p_work_date DATE,
  p_start_time TIME WITHOUT TIME ZONE,
  p_end_time TIME WITHOUT TIME ZONE,
  p_iana_zone TEXT,
  p_fold_policy TEXT
) RETURNS TABLE(start_utc TIMESTAMPTZ, end_utc TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $roster_window$
DECLARE
  local_start TIMESTAMP WITHOUT TIME ZONE;
  local_end TIMESTAMP WITHOUT TIME ZONE;
BEGIN
  IF p_work_date IS NULL
    OR p_work_date NOT BETWEEN DATE '1900-01-01' AND DATE '9999-12-30'
    OR p_start_time IS NULL OR p_end_time IS NULL
    OR p_iana_zone IS NULL OR p_fold_policy IS NULL THEN
    RAISE EXCEPTION 'Complete branch date, shift clocks and IANA policy required'
      USING ERRCODE = '22023';
  END IF;

  local_start := p_work_date + p_start_time;
  local_end := p_work_date + p_end_time
    + CASE WHEN p_end_time <= p_start_time
      THEN INTERVAL '1 day' ELSE INTERVAL '0 day' END;
  start_utc := public.roster_resolve_local_instant(
    local_start, p_iana_zone, p_fold_policy
  );
  end_utc := public.roster_resolve_local_instant(
    local_end, p_iana_zone, p_fold_policy
  );
  IF end_utc <= start_utc THEN
    RAISE EXCEPTION 'Shift duration must be positive in resolved UTC instants'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEXT;
END;
$roster_window$;
REVOKE ALL ON FUNCTION public.roster_shift_utc_window(
  DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

-- Compare *actual instants*, not local wall-clock time. The rest floor is
-- applied symmetrically to shifts in either order, including cross-branch
-- assignments, DST transitions, adjacent dates and overnight shifts.
-- A later policy activation must choose the applicable historical policies
-- and pass the strictest legally applicable rest floor.
CREATE OR REPLACE FUNCTION public.roster_assert_utc_rest(
  p_candidate_start TIMESTAMPTZ,
  p_candidate_end TIMESTAMPTZ,
  p_existing_start TIMESTAMPTZ,
  p_existing_end TIMESTAMPTZ,
  p_minimum_rest_minutes INTEGER
) RETURNS VOID
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $roster_rest$
DECLARE
  gap INTERVAL;
BEGIN
  IF p_candidate_start IS NULL OR p_candidate_end IS NULL
    OR p_existing_start IS NULL OR p_existing_end IS NULL
    OR p_minimum_rest_minutes IS NULL
    OR p_minimum_rest_minutes NOT BETWEEN 0 AND 10080 THEN
    RAISE EXCEPTION 'Complete UTC intervals and bounded minimum rest are required'
      USING ERRCODE = '22023';
  END IF;
  IF p_candidate_end <= p_candidate_start
    OR p_existing_end <= p_existing_start THEN
    RAISE EXCEPTION 'Non-positive roster UTC interval'
      USING ERRCODE = '23514';
  END IF;
  IF p_candidate_start < p_existing_end
    AND p_existing_start < p_candidate_end THEN
    RAISE EXCEPTION 'Roster intervals overlap in UTC'
      USING ERRCODE = '23514';
  END IF;
  IF p_candidate_start >= p_existing_end THEN
    gap := p_candidate_start - p_existing_end;
  ELSE
    gap := p_existing_start - p_candidate_end;
  END IF;
  IF gap < p_minimum_rest_minutes * INTERVAL '1 minute' THEN
    RAISE EXCEPTION 'Roster minimum rest violated in UTC'
      USING ERRCODE = '23514';
  END IF;
END;
$roster_rest$;
REVOKE ALL ON FUNCTION public.roster_assert_utc_rest(
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER
) FROM PUBLIC, anon, authenticated;
