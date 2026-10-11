\set ON_ERROR_STOP on
-- Isolated PostgreSQL 17, synthetic instants only. No business fixtures or
-- production data. All session settings are reverted at ROLLBACK.
BEGIN;
SET LOCAL TIME ZONE 'Pacific/Honolulu';
DO $hr004c$
DECLARE
  first_start TIMESTAMPTZ;
  first_end TIMESTAMPTZ;
  second_start TIMESTAMPTZ;
  second_end TIMESTAMPTZ;
  failed BOOLEAN;
BEGIN
  -- Overnight shift across London DST spring: 8 wall hours = 7 actual hours.
  SELECT start_utc,end_utc INTO first_start,first_end
    FROM public.roster_shift_utc_window(
      DATE '2026-03-28',TIME '22:00',TIME '06:00',
      'Europe/London','reject');
  IF first_start IS DISTINCT FROM '2026-03-28 22:00+00'::timestamptz
    OR first_end IS DISTINCT FROM '2026-03-29 05:00+00'::timestamptz
    OR first_end-first_start IS DISTINCT FROM INTERVAL '7 hours' THEN
    RAISE EXCEPTION 'London spring DST UTC interval incorrect';
  END IF;

  -- An Indian branch shift and an American branch shift must compare as
  -- UTC instants, not their unrelated branch-local calendar/clock values.
  SELECT start_utc,end_utc INTO first_start,first_end
    FROM public.roster_shift_utc_window(
      DATE '2026-10-10',TIME '09:00',TIME '17:00',
      'Asia/Kolkata','reject');
  SELECT start_utc,end_utc INTO second_start,second_end
    FROM public.roster_shift_utc_window(
      DATE '2026-10-09',TIME '23:00',TIME '01:00',
      'America/New_York','reject');
  -- Indian 09:00 = 03:30Z. New York 23:00 the prior day = 03:00Z.
  failed:=false;
  BEGIN
    PERFORM public.roster_assert_utc_rest(
      first_start,first_end,second_start,second_end,0);
  EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Cross-branch UTC overlap was accepted'; END IF;
  -- Exactly touching boundaries are legal when rest=0, not when rest>0.
  PERFORM public.roster_assert_utc_rest(
    '2026-10-10 08:00+00','2026-10-10 12:00+00',
    '2026-10-10 01:00+00','2026-10-10 08:00+00',0);
  failed:=false;
  BEGIN
    PERFORM public.roster_assert_utc_rest(
      '2026-10-10 08:00+00','2026-10-10 12:00+00',
      '2026-10-10 01:00+00','2026-10-10 08:00+00',1);
  EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Adjacent shifts bypassed minimum rest'; END IF;

  -- Gap exactly at threshold is allowed, one minute short rejected in
  -- either direction. Rest is measured in elapsed UTC, not wall clock.
  PERFORM public.roster_assert_utc_rest(
    '2026-10-10 18:00+00','2026-10-10 22:00+00',
    '2026-10-10 04:00+00','2026-10-10 08:00+00',600);
  failed:=false;
  BEGIN
    PERFORM public.roster_assert_utc_rest(
      '2026-10-10 17:59+00','2026-10-10 22:00+00',
      '2026-10-10 04:00+00','2026-10-10 08:00+00',600);
  EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'One minute missing rest was accepted'; END IF;
  failed:=false;
  BEGIN
    PERFORM public.roster_assert_utc_rest(
      '2026-10-10 04:00+00','2026-10-10 08:00+00',
      '2026-10-10 17:59+00','2026-10-10 22:00+00',600);
  EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Reverse-order rest violation accepted'; END IF;

  -- New York autumn fold endpoint requires explicit policy and yields
  -- an unambiguous UTC interval after choosing earlier/later.
  failed:=false;
  BEGIN
    PERFORM * FROM public.roster_shift_utc_window(
      DATE '2026-11-01',TIME '01:30',TIME '03:00',
      'America/New_York','reject');
  EXCEPTION WHEN SQLSTATE '22007' THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Autumn fold silently resolved'; END IF;
  SELECT start_utc,end_utc INTO first_start,first_end
    FROM public.roster_shift_utc_window(
      DATE '2026-11-01',TIME '01:30',TIME '03:00',
      'America/New_York','earlier');
  IF first_start IS DISTINCT FROM '2026-11-01 05:30+00'::timestamptz
    OR first_end IS DISTINCT FROM '2026-11-01 08:00+00'::timestamptz THEN
    RAISE EXCEPTION 'New York earlier fold interval wrong';
  END IF;
  SELECT start_utc,end_utc INTO first_start,first_end
    FROM public.roster_shift_utc_window(
      DATE '2026-11-01',TIME '01:30',TIME '03:00',
      'America/New_York','later');
  IF first_start IS DISTINCT FROM '2026-11-01 06:30+00'::timestamptz
    OR first_end IS DISTINCT FROM '2026-11-01 08:00+00'::timestamptz THEN
    RAISE EXCEPTION 'New York later fold interval wrong';
  END IF;

  -- Spring-forward gap must fail even under a named fold policy.
  failed:=false;
  BEGIN
    PERFORM * FROM public.roster_shift_utc_window(
      DATE '2026-03-08',TIME '02:30',TIME '09:00',
      'America/New_York','later');
  EXCEPTION WHEN SQLSTATE '22007' THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Spring DST gap was accepted'; END IF;

  -- Lord Howe 30-minute DST shift is not rounded to whole hours.
  SELECT start_utc,end_utc INTO first_start,first_end
    FROM public.roster_shift_utc_window(
      DATE '2026-04-04',TIME '23:00',TIME '03:00',
      'Australia/Lord_Howe','later');
  IF first_end-first_start IS DISTINCT FROM INTERVAL '4 hours 30 minutes' THEN
    RAISE EXCEPTION 'Lord Howe real duration not half-hour accurate: %',
      first_end-first_start;
  END IF;

  -- Invalid/null times, negative/too-large rest and inverted intervals
  -- must all fail closed, never silently treating absent policy as zero rest.
  failed:=false;
  BEGIN
    PERFORM * FROM public.roster_shift_utc_window(
      DATE '2026-10-10',TIME '09:00',NULL,'UTC','reject');
  EXCEPTION WHEN invalid_parameter_value THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Incomplete shift accepted'; END IF;
  failed:=false;
  BEGIN
    PERFORM public.roster_assert_utc_rest(
      '2026-10-10 10:00+00','2026-10-10 09:00+00',
      '2026-10-10 01:00+00','2026-10-10 08:00+00',0);
  EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Inverted interval accepted'; END IF;
  failed:=false;
  BEGIN
    PERFORM public.roster_assert_utc_rest(
      '2026-10-10 10:00+00','2026-10-10 12:00+00',
      '2026-10-10 01:00+00','2026-10-10 08:00+00',NULL);
  EXCEPTION WHEN invalid_parameter_value THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'NULL minimum rest accepted'; END IF;
  failed:=false;
  BEGIN
    PERFORM public.roster_assert_utc_rest(
      '2026-10-10 10:00+00','2026-10-10 12:00+00',
      '2026-10-10 01:00+00','2026-10-10 08:00+00',10081);
  EXCEPTION WHEN invalid_parameter_value THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Excessive minimum rest accepted'; END IF;
END;
$hr004c$;

-- An authenticated browser must never call the internal policy primitives.
SET LOCAL ROLE authenticated;
DO $no_browser$
DECLARE denied BOOLEAN:=false;
BEGIN
  BEGIN
    PERFORM * FROM public.roster_shift_utc_window(
      DATE '2026-10-10',TIME '09:00',TIME '17:00','UTC','reject');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Browser can execute UTC interval primitive'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.roster_assert_utc_rest(
      '2026-10-10 09:00+00','2026-10-10 17:00+00',
      '2026-10-10 01:00+00','2026-10-10 08:00+00',60);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Browser can execute rest primitive'; END IF;
END;
$no_browser$;
RESET ROLE;
ROLLBACK;
SELECT 'HR-004C server UTC interval and minimum-rest PostgreSQL E2E PASS' AS result;
