\set ON_ERROR_STOP on
-- Isolated PostgreSQL 17 synthetic tenant fixture only, never production.
BEGIN;
SELECT set_config('request.jwt.claim.sub',
 'a0000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE r JSONB;
BEGIN
 r:=public.save_staff_holiday_rule(
 'a5000000-0000-4000-8000-000000000001','country','IN',NULL,
 DATE '2024-02-29',true,'Approved leap-day rule','informational',true,0);
 IF r->>'accepted'<>'true' OR r->>'attendance_payroll_enforcement_active'<>'false'
 THEN RAISE EXCEPTION 'Holiday authority must create inactive-for-payroll rule'; END IF;
 IF (SELECT count(*) FROM public.staff_holiday_rules)<>1
 THEN RAISE EXCEPTION 'Authorized own tenant holiday not visible'; END IF;
 IF (SELECT count(*) FROM public.staff_holiday_rule_revisions)<>1
 THEN RAISE EXCEPTION 'Immutable initial holiday revision missing'; END IF;
 r:=public.save_staff_holiday_rule(
 'a5000000-0000-4000-8000-000000000001','country','IN',NULL,
 DATE '2024-02-29',true,'Reviewed leap day','non_working',true,1);
 IF r->>'accepted'<>'true' OR (r->'record'->>'version')::integer<>2
 THEN RAISE EXCEPTION 'Holiday optimistic update failed'; END IF;
 IF (SELECT count(*) FROM public.staff_holiday_rule_revisions)<>2
 THEN RAISE EXCEPTION 'Immutable review revision missing'; END IF;
 r:=public.save_staff_holiday_rule(
 'a5000000-0000-4000-8000-000000000001','country','IN',NULL,
 DATE '2024-02-29',true,'Stale overwrite','informational',true,1);
 IF r->>'accepted'<>'false' OR r->>'reason'<>'stale_revision'
 THEN RAISE EXCEPTION 'Stale holiday revision must be refused'; END IF;
 BEGIN
   r:=public.save_staff_holiday_rule(
     'a5000000-0000-4000-8000-000000000001','country','IN',NULL,
     DATE '2024-03-01',true,'Forged date','non_working',true,2);
   RAISE EXCEPTION 'Immutable holiday date changed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
   INSERT INTO public.staff_holiday_rules(id,org_id,scope,holiday_on,name,
     treatment,created_by,updated_by)
   VALUES('a5000000-0000-4000-8000-000000000009',
    '10000000-0000-0000-0000-000000000001','organization',
    DATE '2026-10-11','Illicit','non_working',
    'a0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001');
   RAISE EXCEPTION 'Direct authenticated holiday DML accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 'a0000000-0000-0000-0000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE r JSONB;
BEGIN
 IF EXISTS (SELECT 1 FROM public.staff_holiday_rules)
 THEN RAISE EXCEPTION 'Cashier can read manager holiday policy'; END IF;
 BEGIN
  r:=public.save_staff_holiday_rule(
  'a5000000-0000-4000-8000-000000000002','organization',NULL,NULL,
  DATE '2026-10-11',false,'Illicit cashier day','non_working',true,0);
  RAISE EXCEPTION 'Cashier holiday mutation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 'b0000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE r JSONB;
BEGIN
 IF EXISTS (SELECT 1 FROM public.staff_holiday_rules)
 THEN RAISE EXCEPTION 'Cross-tenant holiday policy visible'; END IF;
 BEGIN
  r:=public.save_staff_holiday_rule(
  'a5000000-0000-4000-8000-000000000001','country','IN',NULL,
  DATE '2024-02-29',true,'Cross tenant override','non_working',false,2);
  RAISE EXCEPTION 'Cross tenant holiday update accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  r:=public.save_staff_holiday_rule(
  'a5000000-0000-4000-8000-000000000003','branch',NULL,
  'c1000000-0000-4000-8000-000000000001',DATE '2026-10-11',
  false,'Foreign branch','non_working',true,0);
  RAISE EXCEPTION 'Cross tenant branch accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
DO $test$ BEGIN
 IF EXISTS(SELECT 1 FROM public.staff_holiday_rule_revisions
 WHERE org_id<>'10000000-0000-0000-0000-000000000001')
 THEN RAISE EXCEPTION 'Foreign holiday history appeared'; END IF;
 IF (SELECT count(*) FROM public.audit_logs
 WHERE table_name='staff_holiday_rules')<>2
 THEN RAISE EXCEPTION 'Holiday action audit ledger incorrect'; END IF;
 BEGIN
   DELETE FROM public.staff_holiday_rule_revisions;
   RAISE EXCEPTION 'Immutable history unexpectedly deletable';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $test$;
ROLLBACK;
SELECT 'HR005 holiday version/RLS/manager audit PostgreSQL 17 PASS';
