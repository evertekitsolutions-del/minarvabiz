\set ON_ERROR_STOP on
-- PostgreSQL 17 CI service only: no production database or fake customers.
-- The real resolver migration must already be loaded for this test.
BEGIN;
SET LOCAL TIME ZONE 'Pacific/Honolulu';
DO $timezone_test$
DECLARE
  early TIMESTAMPTZ;
  late TIMESTAMPTZ;
  midnight TIMESTAMPTZ;
  failed BOOLEAN;
BEGIN
  -- The result is independent of connection/server time zone.
  IF public.roster_resolve_local_instant(
    '2026-10-10 09:00'::timestamp,'Asia/Kolkata','reject'
  ) IS DISTINCT FROM '2026-10-10 03:30:00+00'::timestamptz THEN
    RAISE EXCEPTION 'Kolkata 05:30 offset resolved incorrectly';
  END IF;
  IF public.roster_resolve_local_instant(
    '2026-10-10 09:00'::timestamp,'UTC','reject'
  ) IS DISTINCT FROM '2026-10-10 09:00:00+00'::timestamptz THEN
    RAISE EXCEPTION 'Explicit UTC zone resolved incorrectly';
  END IF;

  -- New York spring gap: a plain AT TIME ZONE silently coerces this.
  failed:=false;
  BEGIN
    PERFORM public.roster_resolve_local_instant(
      '2026-03-08 02:30'::timestamp,'America/New_York','earlier');
  EXCEPTION WHEN SQLSTATE '22007' THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Spring-forward gap was accepted'; END IF;

  -- New York fall fold: earlier and later differ by 60 real minutes.
  failed:=false;
  BEGIN
    PERFORM public.roster_resolve_local_instant(
      '2026-11-01 01:30'::timestamp,'America/New_York','reject');
  EXCEPTION WHEN SQLSTATE '22007' THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Ambiguous New York fold was implicitly chosen'; END IF;
  early:=public.roster_resolve_local_instant(
    '2026-11-01 01:30'::timestamp,'America/New_York','earlier');
  late:=public.roster_resolve_local_instant(
    '2026-11-01 01:30'::timestamp,'America/New_York','later');
  IF early IS DISTINCT FROM '2026-11-01 05:30+00'::timestamptz
     OR late IS DISTINCT FROM '2026-11-01 06:30+00'::timestamptz
     OR late-early IS DISTINCT FROM INTERVAL '60 minutes' THEN
    RAISE EXCEPTION 'New York fold instant resolution failed: % <> %',early,late;
  END IF;

  -- Lord Howe has half-hour DST transitions, not a whole hour.
  failed:=false;
  BEGIN
    PERFORM public.roster_resolve_local_instant(
      '2026-10-04 02:15'::timestamp,'Australia/Lord_Howe','later');
  EXCEPTION WHEN SQLSTATE '22007' THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Lord Howe half-hour spring gap accepted'; END IF;
  early:=public.roster_resolve_local_instant(
    '2026-04-05 01:45'::timestamp,'Australia/Lord_Howe','earlier');
  late:=public.roster_resolve_local_instant(
    '2026-04-05 01:45'::timestamp,'Australia/Lord_Howe','later');
  IF late-early IS DISTINCT FROM INTERVAL '30 minutes' THEN
    RAISE EXCEPTION 'Lord Howe fold not resolved as 30-minute ambiguity: %, %',early,late;
  END IF;

  -- The same overnight wall-clock interval may be 7 real hours over DST.
  IF public.roster_resolve_local_instant(
        '2026-03-29 06:00'::timestamp,'Europe/London','reject')
      - public.roster_resolve_local_instant(
        '2026-03-28 22:00'::timestamp,'Europe/London','reject')
     IS DISTINCT FROM INTERVAL '7 hours' THEN
    RAISE EXCEPTION 'London overnight DST interval is not 7 real hours';
  END IF;
  -- Invalid policy and unknown / POSIX-style timezone strings fail closed.
  FOR midnight IN SELECT value FROM (VALUES
    ('2026-10-10 00:00:00+00'::timestamptz)) AS cases(value)
  LOOP
    failed:=false;
    BEGIN
      PERFORM public.roster_resolve_local_instant(
        '2026-10-10 09:00'::timestamp,'America/New_York','unreviewed');
    EXCEPTION WHEN SQLSTATE '22007' THEN failed:=true; END;
    IF NOT failed THEN RAISE EXCEPTION 'Invalid fold decision accepted'; END IF;
    failed:=false;
    BEGIN
      PERFORM public.roster_resolve_local_instant(
        '2026-10-10 09:00'::timestamp,'../America/New_York','earlier');
    EXCEPTION WHEN SQLSTATE '22007' THEN failed:=true; END;
    IF NOT failed THEN RAISE EXCEPTION 'Invalid timezone path accepted'; END IF;
    failed:=false;
    BEGIN
      PERFORM public.roster_resolve_local_instant(
        '2026-10-10 09:00'::timestamp,'Mars/Olympus_Mons','earlier');
    EXCEPTION WHEN SQLSTATE '22007' THEN failed:=true; END;
    IF NOT failed THEN RAISE EXCEPTION 'Unknown named zone accepted'; END IF;
  END LOOP;
END;
$timezone_test$;

-- The internal function is NOT a public/authenticated Data API write path.
SET LOCAL ROLE authenticated;
DO $denied$
DECLARE refused BOOLEAN:=false;
BEGIN
  BEGIN
    PERFORM public.roster_resolve_local_instant(
      '2026-10-10 09:00'::timestamp,'UTC','reject');
  EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
  IF NOT refused THEN RAISE EXCEPTION 'Authenticated caller can execute internal resolver'; END IF;
END;
$denied$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $denied$
DECLARE refused BOOLEAN:=false;
BEGIN
  BEGIN
    PERFORM public.roster_resolve_local_instant(
      '2026-10-10 09:00'::timestamp,'UTC','reject');
  EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
  IF NOT refused THEN RAISE EXCEPTION 'Anonymous caller can execute internal resolver'; END IF;
END;
$denied$;
RESET ROLE;
ROLLBACK;
SELECT 'HR004C PostgreSQL IANA/DST resolver E2E PASS' AS test_result;
