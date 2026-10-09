-- Isolated Supabase stack only. Test fixtures and all writes roll back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('ca000000-0000-0000-0000-000000000001','workforce-admin@example.test'),
 ('ca000000-0000-0000-0000-000000000002','workforce-other@example.test'),
 ('ca000000-0000-0000-0000-000000000003','workforce-cashier@example.test');
UPDATE public.organization_members SET role='cashier'
 WHERE user_id='ca000000-0000-0000-0000-000000000003';
SET LOCAL ROLE service_role;
INSERT INTO public.staff_members(id,name,org_id,branch_id)
 SELECT 'cb000000-0000-0000-0000-000000000001','Roster RPC staff',om.org_id,b.id
 FROM public.organization_members om JOIN public.branches b ON b.org_id=om.org_id
 WHERE om.user_id='ca000000-0000-0000-0000-000000000001' AND b.is_headquarters;
INSERT INTO public.staff_members(id,name,org_id)
 SELECT 'cb000000-0000-0000-0000-000000000002','Foreign roster staff',org_id
 FROM public.organization_members WHERE user_id='ca000000-0000-0000-0000-000000000002';
RESET ROLE;

SELECT set_config('request.jwt.claims',
 '{"sub":"ca000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  branch UUID;
  shift_event JSONB;
  early_event JSONB;
  slot_event JSONB;
  answer JSONB;
BEGIN
  SELECT branch_id INTO STRICT branch FROM public.staff_members
    WHERE id='cb000000-0000-0000-0000-000000000001';

  shift_event := jsonb_build_object(
    'id','cc000000-0000-0000-0000-000000000001','name','Overnight',
    'startTime','22:00','endTime','06:00','unpaidBreakMinutes',30,
    'active',true,'branchId',null,'version',1);
  answer:=public.apply_staff_roster_event('shift',shift_event,
    'ce000000-0000-0000-0000-000000000001','test-device',1);
  IF answer->>'accepted'<>'true' OR answer->>'replayed'<>'false' THEN
    RAISE EXCEPTION 'Atomic shift create failed: %',answer; END IF;
  answer:=public.apply_staff_roster_event('shift',shift_event,
    'ce000000-0000-0000-0000-000000000001','test-device',1);
  IF answer->>'replayed'<>'true' THEN RAISE EXCEPTION 'Shift retry was not idempotent'; END IF;
  BEGIN
    PERFORM public.apply_staff_roster_event('shift',
      shift_event||'{"name":"Wrong payload"}'::jsonb,
      'ce000000-0000-0000-0000-000000000001','test-device',1);
    RAISE EXCEPTION 'Tampered retry accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  early_event:=shift_event||jsonb_build_object(
    'id','cc000000-0000-0000-0000-000000000002',
    'name','Early shift','startTime','04:00','endTime','12:00');
  answer:=public.apply_staff_roster_event('shift',early_event,
    'ce000000-0000-0000-0000-000000000002','test-device',2);
  IF answer->>'accepted'<>'true' THEN RAISE EXCEPTION 'Second template missing'; END IF;

  slot_event:=jsonb_build_object(
    'id','cd000000-0000-0000-0000-000000000001',
    'staffId','cb000000-0000-0000-0000-000000000001',
    'shiftRuleId','cc000000-0000-0000-0000-000000000001',
    'branchId',branch,'workDate','2026-10-09',
    'status','scheduled','version',1);
  answer:=public.apply_staff_roster_event('roster',slot_event,
    'ce000000-0000-0000-0000-000000000003','test-device',3);
  IF answer->>'accepted'<>'true' THEN RAISE EXCEPTION 'Roster create failed'; END IF;
  answer:=public.apply_staff_roster_event('roster',slot_event,
    'ce000000-0000-0000-0000-000000000003','test-device',3);
  IF answer->>'replayed'<>'true' THEN RAISE EXCEPTION 'Roster retry not idempotent'; END IF;
  BEGIN
    PERFORM public.apply_staff_roster_event('roster',
      slot_event||jsonb_build_object('id','cd000000-0000-0000-0000-000000000002',
        'shiftRuleId','cc000000-0000-0000-0000-000000000002','workDate','2026-10-10'),
      'ce000000-0000-0000-0000-000000000004','test-device',4);
    RAISE EXCEPTION 'Overnight overlap accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    PERFORM public.apply_staff_roster_event('roster',
      slot_event||jsonb_build_object('id','cd000000-0000-0000-0000-000000000003',
        'staffId','cb000000-0000-0000-0000-000000000002',
        'workDate','2026-10-11'),
      'ce000000-0000-0000-0000-000000000005','test-device',5);
    RAISE EXCEPTION 'Cross-tenant staff accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  answer:=public.apply_staff_roster_event('roster',
    slot_event||'{"status":"cancelled","version":2}'::jsonb,
    'ce000000-0000-0000-0000-000000000006','test-device',6);
  IF answer->>'accepted'<>'true' THEN RAISE EXCEPTION 'Roster revision rejected'; END IF;
  answer:=public.apply_staff_roster_event('roster',
    slot_event||'{"status":"scheduled","version":2}'::jsonb,
    'ce000000-0000-0000-0000-000000000007','other-device',1);
  IF answer->>'accepted'<>'false' OR (answer->'remote'->>'version')::int<>2 THEN
    RAISE EXCEPTION 'Stale roster revision was not rejected: %',answer;
  END IF;
  BEGIN
    PERFORM public.apply_staff_roster_event('roster',
      slot_event||'{"workDate":"2026-10-10","version":3}'::jsonb,
      'ce000000-0000-0000-0000-000000000008','test-device',7);
    RAISE EXCEPTION 'Roster identity changed';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.staff_roster_slots
      (org_id,staff_id,shift_rule_id,branch_id,work_date,status)
    SELECT org_id,'cb000000-0000-0000-0000-000000000001',
      'cc000000-0000-0000-0000-000000000001',branch,'2026-10-11','scheduled'
    FROM public.organization_members WHERE user_id='ca000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'Direct authenticated roster insert accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$test$;
RESET ROLE;

DO $test$ BEGIN
 IF (SELECT count(*) FROM public.staff_roster_event_receipts WHERE device_id='test-device')<>4 THEN
   RAISE EXCEPTION 'Event receipts not committed atomically'; END IF;
 IF (SELECT count(*) FROM public.audit_logs WHERE action LIKE 'roster.%' AND
       user_id='ca000000-0000-0000-0000-000000000001')<>4 THEN
   RAISE EXCEPTION 'Audit count does not match committed events'; END IF;
END $test$;

SELECT set_config('request.jwt.claims',
 '{"sub":"ca000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 IF EXISTS(SELECT 1 FROM public.staff_roster_slots) THEN RAISE EXCEPTION 'Cashier can read HR roster'; END IF;
 BEGIN
   PERFORM public.apply_staff_roster_event('shift',
     '{"id":"cc000000-0000-0000-0000-000000000005","name":"Unauthorized","startTime":"10:00","endTime":"18:00","unpaidBreakMinutes":0,"active":true,"branchId":null,"version":1}'::jsonb,
     'ce000000-0000-0000-0000-000000000009','cashier-device',1);
   RAISE EXCEPTION 'Cashier wrote shift via RPC';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
 '{"sub":"ca000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 IF EXISTS(SELECT 1 FROM public.staff_roster_slots) THEN RAISE EXCEPTION 'Cross tenant read allowed'; END IF;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'Workforce roster atomic mutation E2E PASS';
