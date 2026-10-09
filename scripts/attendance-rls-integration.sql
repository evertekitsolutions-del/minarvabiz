\set ON_ERROR_STOP on
CREATE ROLE service_role NOLOGIN;
-- Legacy helpers required by the original attendance migration; minimal tenant harness omits them.
CREATE FUNCTION public.user_org_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT org_id FROM public.organization_members WHERE user_id=auth.uid() $$;
REVOKE ALL ON FUNCTION public.user_org_ids() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.user_org_ids() TO authenticated;
CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$ SELECT org_id FROM public.organization_members WHERE user_id=auth.uid() ORDER BY org_id LIMIT 1 $$;
REVOKE ALL ON FUNCTION public.current_org_id() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;
CREATE FUNCTION test.expect_attendance_error(command text, expected_state text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  BEGIN EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE=expected_state THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'Expected attendance SQLSTATE %',expected_state;
END;
$$;
GRANT EXECUTE ON FUNCTION test.expect_attendance_error(text,text) TO authenticated;
CREATE TABLE public.branches (id uuid PRIMARY KEY, org_id uuid NOT NULL);
CREATE TABLE public.staff_members (id uuid PRIMARY KEY, org_id uuid NOT NULL, branch_id uuid);
GRANT SELECT ON public.staff_members, public.branches TO authenticated;
INSERT INTO public.branches VALUES ('ba000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),('bb000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002');
INSERT INTO public.staff_members VALUES ('aa000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',null);
INSERT INTO public.staff_members VALUES ('bb000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',null);
\i supabase/migrations/20261008_attendance_grid.sql
-- Apply the additive hardening only when provided, so this suite can prove the original gap.
\if :{?attendance_hardening}
\i :attendance_hardening
\endif
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false);
INSERT INTO public.staff_attendance(id,org_id,staff_id,attendance_date,status) VALUES ('ac000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','2026-10-08','present');
SELECT test.expect_rls_denial($Q$INSERT INTO public.staff_attendance(org_id,staff_id,attendance_date,status) VALUES ('10000000-0000-0000-0000-000000000001','bb000000-0000-0000-0000-000000000002','2026-10-08','present')$Q$,'cross-tenant staff reference');
SELECT test.expect_rls_denial($Q$INSERT INTO public.staff_attendance(org_id,staff_id,branch_id,attendance_date,status) VALUES ('10000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','bb000000-0000-0000-0000-000000000002','2026-10-09','present')$Q$,'cross-tenant branch reference');
UPDATE public.staff_attendance SET status='half_day',version=2 WHERE id='ac000000-0000-0000-0000-000000000001' AND version=1;
SELECT test.assert_true((SELECT version FROM public.staff_attendance WHERE id='ac000000-0000-0000-0000-000000000001')=2,'manager update persisted');
SELECT test.expect_attendance_error($Q$UPDATE public.staff_attendance SET status='present',version=2 WHERE id='ac000000-0000-0000-0000-000000000001'$Q$,'40001');
SELECT test.expect_attendance_error($Q$UPDATE public.staff_attendance SET attendance_date='2026-10-10',version=3 WHERE id='ac000000-0000-0000-0000-000000000001'$Q$,'23514');
SELECT test.expect_attendance_error($Q$UPDATE public.staff_attendance SET clock_in='2026-10-08T18:00:00Z',clock_out='2026-10-08T09:00:00Z',version=3 WHERE id='ac000000-0000-0000-0000-000000000001'$Q$,'23514');
SELECT test.expect_attendance_error($Q$UPDATE public.staff_attendance SET clock_in='2026-10-08T09:00:00Z',clock_out='2026-10-08T10:00:00Z',break_minutes=61,version=3 WHERE id='ac000000-0000-0000-0000-000000000001'$Q$,'23514');
UPDATE public.staff_attendance SET clock_in='2026-10-08T09:00:00Z',clock_out='2026-10-08T18:00:00Z',break_minutes=30,overtime_minutes=45,notes='Fixture only',version=3 WHERE id='ac000000-0000-0000-0000-000000000001';
SELECT test.assert_true((SELECT EXTRACT(EPOCH FROM clock_out-clock_in)/60-break_minutes FROM public.staff_attendance WHERE id='ac000000-0000-0000-0000-000000000001')=510,'clock/break persisted and invalid revisions rejected');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',false);
SELECT test.expect_rls_denial($Q$INSERT INTO public.staff_attendance(org_id,staff_id,attendance_date,status) VALUES ('10000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','2026-10-09','present')$Q$,'cashier cannot write HR');
UPDATE public.staff_attendance SET status='absent',version=4;
SELECT test.assert_true((SELECT status FROM public.staff_attendance LIMIT 1)='half_day','cashier cannot update HR');
DELETE FROM public.staff_attendance;
SELECT test.assert_true((SELECT count(*) FROM public.staff_attendance)=1,'cashier cannot delete HR');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',false);
SELECT test.assert_true((SELECT count(*) FROM public.staff_attendance)=0,'tenant B cannot read tenant A attendance');
RESET ROLE;
SELECT 'Attendance PostgreSQL RLS role/relation integration PASS' AS result;
