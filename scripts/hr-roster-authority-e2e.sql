-- Only in isolated local Supabase CI. Every fixture rolls back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('ba000000-0000-0000-0000-000000000001','roster-admin@example.test'),
 ('ba000000-0000-0000-0000-000000000002','roster-other@example.test'),
 ('ba000000-0000-0000-0000-000000000003','roster-cashier@example.test');
UPDATE public.organization_members SET role='cashier'
 WHERE user_id='ba000000-0000-0000-0000-000000000003';
SET LOCAL ROLE service_role;
INSERT INTO public.staff_members(id,name,org_id,branch_id)
 SELECT 'bb000000-0000-0000-0000-000000000001','Roster staff',om.org_id,b.id
 FROM public.organization_members om JOIN public.branches b
 ON b.org_id=om.org_id WHERE om.user_id='ba000000-0000-0000-0000-000000000001' AND b.is_headquarters;
INSERT INTO public.staff_members(id,name,org_id)
 SELECT 'bb000000-0000-0000-0000-000000000002','Other tenant staff',org_id
 FROM public.organization_members WHERE user_id='ba000000-0000-0000-0000-000000000002';
INSERT INTO public.staff_shift_rules(id,org_id,name,branch_id,start_time,end_time,unpaid_break_minutes)
 SELECT 'bc000000-0000-0000-0000-000000000001',org_id,'Overnight',NULL,'22:00','06:00',30
 FROM public.organization_members WHERE user_id='ba000000-0000-0000-0000-000000000001';
INSERT INTO public.staff_shift_rules(id,org_id,name,branch_id,start_time,end_time,unpaid_break_minutes)
 SELECT 'bc000000-0000-0000-0000-000000000002',org_id,'Morning',NULL,'04:00','12:00',30
 FROM public.organization_members WHERE user_id='ba000000-0000-0000-0000-000000000001';
INSERT INTO public.staff_shift_rules(id,org_id,name,branch_id,start_time,end_time,unpaid_break_minutes)
 SELECT 'bc000000-0000-0000-0000-000000000003',org_id,'Regular',NULL,'09:00','17:00',30
 FROM public.organization_members WHERE user_id='ba000000-0000-0000-0000-000000000001';
INSERT INTO public.staff_roster_slots(id,org_id,staff_id,shift_rule_id,branch_id,work_date,status)
 SELECT 'bd000000-0000-0000-0000-000000000001',om.org_id,'bb000000-0000-0000-0000-000000000001',
 'bc000000-0000-0000-0000-000000000001',b.id,'2026-10-09','scheduled'
 FROM public.organization_members om JOIN public.branches b ON b.org_id=om.org_id
 WHERE om.user_id='ba000000-0000-0000-0000-000000000001' AND b.is_headquarters;
DO $test$
DECLARE tenant UUID; branch UUID; success BOOLEAN := false;
BEGIN
 SELECT org_id INTO tenant FROM public.organization_members WHERE user_id='ba000000-0000-0000-0000-000000000001';
 SELECT branch_id INTO branch FROM public.staff_members WHERE id='bb000000-0000-0000-0000-000000000001';
 BEGIN
  INSERT INTO public.staff_roster_slots(org_id,staff_id,shift_rule_id,branch_id,work_date,status)
  VALUES (tenant,'bb000000-0000-0000-0000-000000000001','bc000000-0000-0000-0000-000000000002',branch,'2026-10-10','scheduled');
  RAISE EXCEPTION 'Overnight overlap escaped trigger';
 EXCEPTION WHEN check_violation THEN
  success := true;
 END;
 IF NOT success THEN RAISE EXCEPTION 'Overnight overlap never rejected'; END IF;
 BEGIN
  UPDATE public.staff_shift_rules SET start_time='21:30',version=2 WHERE id='bc000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'Historical shift mutated';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE public.staff_roster_slots SET status='cancelled',version=5 WHERE id='bd000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'Stale roster revision accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  INSERT INTO public.staff_roster_slots(org_id,staff_id,shift_rule_id,branch_id,work_date,status)
  VALUES (tenant,'bb000000-0000-0000-0000-000000000002','bc000000-0000-0000-0000-000000000003',branch,'2026-10-12','scheduled');
  RAISE EXCEPTION 'Cross-tenant staff accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $test$;
-- All reads go through RLS. No direct authenticated DML should be possible.
SELECT set_config('request.jwt.claims','{"sub":"ba000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 IF (SELECT count(*) FROM public.staff_roster_slots)<>1 THEN RAISE EXCEPTION 'Manager own roster is not visible'; END IF;
 BEGIN
  UPDATE public.staff_roster_slots SET status='cancelled';
  RAISE EXCEPTION 'Direct attendance-style bypass accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"ba000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 IF EXISTS(SELECT 1 FROM public.staff_roster_slots) THEN RAISE EXCEPTION 'Cross-tenant roster visible'; END IF;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"ba000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 IF EXISTS(SELECT 1 FROM public.staff_roster_slots) THEN RAISE EXCEPTION 'Cashier can read HR rosters'; END IF;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'HR ROSTER SCHEMA ISOLATED E2E PASS';
