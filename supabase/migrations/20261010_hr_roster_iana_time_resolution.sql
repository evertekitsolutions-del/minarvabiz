-- HR-004C, slice 1: PostgreSQL-owned IANA wall-clock -> UTC instant resolver.
-- This helper intentionally DOES NOT yet replace staff_roster_guard().
-- Existing rosters remain unchanged until an approved branch policy,
-- history-safe deployment and the next server authority migration are verified.
-- Reject gaps (non-existent times) and folds unless the caller supplies an
-- explicit earlier/later decision. No session/client timezone fallback.
--
-- PostgreSQL's plain "local_timestamp AT TIME ZONE zone" silently chooses
-- an interpretation of ambiguous or non-existent civil times. Round-trip
-- every candidate against the named IANA zone to enforce explicit decisions.
-- Sample offsets across +/-36 hours in 15-minute steps, also covering
-- historical non-whole-hour offsets and Lord Howe's 30-minute DST shifts.
--
-- Provider neutral: PostgreSQL + IANA/tzdata only, no Supabase-specific SQL.
CREATE OR REPLACE FUNCTION public.roster_resolve_local_instant(
  p_local TIMESTAMP WITHOUT TIME ZONE,
  p_iana_zone TEXT,
  p_fold_policy TEXT DEFAULT 'reject'
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $roster_utc$
DECLARE
  v_probe TIMESTAMPTZ;
  v_offset INTERVAL;
  v_candidate TIMESTAMPTZ;
  v_matches TIMESTAMPTZ[] := ARRAY[]::TIMESTAMPTZ[];
  v_earlier TIMESTAMPTZ;
  v_later TIMESTAMPTZ;
BEGIN
  IF p_local IS NULL OR p_iana_zone IS NULL OR p_iana_zone = ''
    OR p_fold_policy IS NULL
    OR p_fold_policy NOT IN ('reject','earlier','later')
    OR p_local::DATE NOT BETWEEN DATE '1900-01-01' AND DATE '9999-12-31' THEN
    RAISE EXCEPTION 'Roster timezone input or fold policy is invalid'
      USING ERRCODE='22007';
  END IF;
  IF p_iana_zone <> 'UTC'
    AND p_iana_zone !~ '^[A-Za-z][A-Za-z0-9_+.-]*(/[A-Za-z0-9_+.-]+)+$' THEN
    RAISE EXCEPTION 'A named IANA timezone is required'
      USING ERRCODE='22007';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_iana_zone) THEN
    RAISE EXCEPTION 'Unknown roster IANA timezone'
      USING ERRCODE='22007';
  END IF;

  -- No inference from the server's TimeZone setting. Candidate instants are
  -- interpreted explicitly as UTC, then round-tripped to the branch zone.
  FOR v_probe IN
    SELECT (p_local AT TIME ZONE 'UTC') + n * INTERVAL '1 minute'
      FROM pg_catalog.generate_series(-2160,2160,15) AS n
  LOOP
    v_offset := (v_probe AT TIME ZONE p_iana_zone)
                - (v_probe AT TIME ZONE 'UTC');
    v_candidate := (p_local - v_offset) AT TIME ZONE 'UTC';
    IF (v_candidate AT TIME ZONE p_iana_zone) = p_local
      AND NOT (v_candidate = ANY(v_matches)) THEN
      v_matches := pg_catalog.array_append(v_matches,v_candidate);
    END IF;
  END LOOP;

  IF pg_catalog.cardinality(v_matches)=0 THEN
    RAISE EXCEPTION 'Roster branch-local time does not exist (DST gap)'
      USING ERRCODE='22007';
  END IF;
  SELECT pg_catalog.min(value),pg_catalog.max(value)
    INTO v_earlier,v_later FROM pg_catalog.unnest(v_matches) AS value;
  IF v_earlier IS DISTINCT FROM v_later AND p_fold_policy='reject' THEN
    RAISE EXCEPTION 'Roster branch-local time is ambiguous (DST fold); choose earlier or later'
      USING ERRCODE='22007';
  END IF;
  IF p_fold_policy='later' THEN RETURN v_later; END IF;
  RETURN v_earlier;
END;
$roster_utc$;

-- This function is an internal server authority primitive, not a browser
-- PostgREST RPC. Calls must flow through verified audited roster authority.
REVOKE ALL ON FUNCTION public.roster_resolve_local_instant(
  TIMESTAMP WITHOUT TIME ZONE,TEXT,TEXT
) FROM PUBLIC, anon, authenticated;
