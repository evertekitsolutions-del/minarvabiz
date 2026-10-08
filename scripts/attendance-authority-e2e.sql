-- Run only against the isolated CI Supabase stack. Everything rolls back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('aa000000-0000-0000-0000-000000000001','attendance-admin@example.test'),
 ('aa000000-0000-0000-0000-000000000002','attendance-other@example.test'),
 ('aa000000-0000-0000-0000-000000000003','attendance-cashier@example.test');
-- Bootstrap created one org for each fixture account; make the third a cashier.
UPDATE public.organization_members SET role='cashier' WHERE user_id='aa000000-0000-0000-0000-000000000003';
INSERT INTO public.staff_members(id,name,org_id,branch_id)
 SELECT 'ab000000-0000-0000-0000-000000000001','Attendance fixture',om.org_id,b.id
 FROM public.organization_members om JOIN public.branches b ON b.org_id=om.org_id
 WHERE om.user_id='aa000000-0000-0000-0000-000000000001' AND b.is_headquarters;
INSERT INTO public.staff_members(id,name,org_id)
 SELECT 'ab000000-0000-0000-0000-000000000002','Foreign fixture',org_id
 FROM public.organization_members WHERE user_id='aa000000-0000-0000-0000-000000000002';
SELECT set_config('request.jwt.claims','{"sub":"aa000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE payload JSONB; r JSONB; branch UUID; other_branch UUID;
BEGIN
 SELECT branch_id INTO branch FROM public.staff_members WHERE id='ab000000-0000-0000-0000-000000000001';
 payload:=jsonb_build_object('id','ac000000-0000-0000-0000-000000000001','staffId','ab000000-0000-0000-0000-000000000001',
 'date','2026-10-08','status','present','clockIn','2026-10-08T09:00:00Z','clockOut','2026-10-08T18:00:00Z',
 'breakMinutes',30,'overtimeMinutes',60,'version',1,'branchId',branch);
 r:=public.apply_staff_attendance_event(payload,'ad000000-0000-0000-0000-000000000001','fixture-device',1);
 IF NOT (r->>'accepted')::boolean THEN RAISE EXCEPTION 'First event rejected'; END IF;
 r:=public.apply_staff_attendance_event(payload,'ad000000-0000-0000-0000-000000000001','fixture-device',1);
 IF r->>'replayed'<>'true' THEN RAISE EXCEPTION 'Duplicate event not replayed'; END IF;
 BEGIN
  PERFORM public.apply_staff_attendance_event(payload||'{"status":"absent"}',
  'ad000000-0000-0000-0000-000000000001','fixture-device',1);
  RAISE EXCEPTION 'Changed replay accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Attendance event identity conflict' THEN RAISE; END IF; END;
 payload:=payload||'{"version":2,"status":"half_day"}';
 r:=public.apply_staff_attendance_event(payload,'ad000000-0000-0000-0000-000000000002','fixture-device',2);
 IF r->>'accepted'<>'true' THEN RAISE EXCEPTION 'Correction rejected'; END IF;
 r:=public.apply_staff_attendance_event(payload||'{"status":"absent"}',
 'ad000000-0000-0000-0000-000000000003','other-device',1);
 IF r->>'accepted'<>'false' OR r->'remote'->>'status'<>'half_day' THEN RAISE EXCEPTION 'Stale correction overwrote remote'; END IF;
 BEGIN
  PERFORM public.apply_staff_attendance_event(payload||'{"version":3,"branchId":null}',
  'ad000000-0000-0000-0000-000000000004','fixture-device',3);
  RAISE EXCEPTION 'Wrong branch accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.apply_staff_attendance_event(payload||'{"staffId":"ab000000-0000-0000-0000-000000000002","version":1}',
  'ad000000-0000-0000-0000-000000000005','fixture-device',4);
  RAISE EXCEPTION 'Foreign staff accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.apply_staff_attendance_event(payload||'{"version":3,"clockOut":"2026-10-08T08:00:00Z"}',
  'ad000000-0000-0000-0000-000000000006','fixture-device',5);
  RAISE EXCEPTION 'Reversed clock accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE public.staff_attendance SET status='absent';
  RAISE EXCEPTION 'Direct write bypassed event authority';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.staff_attendance_event_receipts WHERE device_id='fixture-device')<>2 THEN RAISE EXCEPTION 'Replay receipt count incorrect'; END IF;
 IF (SELECT count(*) FROM public.audit_logs WHERE record_id='ac000000-0000-0000-0000-000000000001')<>2 THEN RAISE EXCEPTION 'Atomic audit count incorrect'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"aa000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.staff_attendance) THEN RAISE EXCEPTION 'Foreign tenant attendance visible'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"aa000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.staff_attendance) THEN RAISE EXCEPTION 'Cashier read HR data'; END IF;
 BEGIN
  PERFORM public.apply_staff_attendance_event('{"id":"ac000000-0000-0000-0000-000000000003","staffId":"ab000000-0000-0000-0000-000000000001","date":"2026-10-08","version":1,"status":"present","breakMinutes":0,"overtimeMinutes":0}',
   'ad000000-0000-0000-0000-000000000007','cashier-device',1);
  RAISE EXCEPTION 'Cashier wrote attendance';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Attendance authority E2E PASS';
