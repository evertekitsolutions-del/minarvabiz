-- Additive Attendance Grid authorization, relation integrity and optimistic concurrency.
-- Keep historical rows; NOT VALID constraints apply to new/changed rows without rewriting history.
DROP POLICY IF EXISTS staff_attendance_org_access ON public.staff_attendance;
CREATE POLICY staff_attendance_member_read ON public.staff_attendance
  FOR SELECT TO authenticated USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY staff_attendance_manager_insert ON public.staff_attendance
  FOR INSERT TO authenticated WITH CHECK (
    public.user_has_org_role(org_id,ARRAY['super_admin','admin','manager']::text[])
    AND EXISTS (SELECT 1 FROM public.staff_members s WHERE s.id=staff_id AND s.org_id=staff_attendance.org_id)
    AND (branch_id IS NULL OR EXISTS (SELECT 1 FROM public.branches b WHERE b.id=branch_id AND b.org_id=staff_attendance.org_id))
  );
CREATE POLICY staff_attendance_manager_update ON public.staff_attendance
  FOR UPDATE TO authenticated
  USING (public.user_has_org_role(org_id,ARRAY['super_admin','admin','manager']::text[]))
  WITH CHECK (
    public.user_has_org_role(org_id,ARRAY['super_admin','admin','manager']::text[])
    AND EXISTS (SELECT 1 FROM public.staff_members s WHERE s.id=staff_id AND s.org_id=staff_attendance.org_id)
    AND (branch_id IS NULL OR EXISTS (SELECT 1 FROM public.branches b WHERE b.id=branch_id AND b.org_id=staff_attendance.org_id))
  );
-- There is no authenticated DELETE policy: corrections retain ledger history.
ALTER TABLE public.staff_attendance ADD CONSTRAINT attendance_clock_range
  CHECK ((clock_in IS NULL OR isfinite(clock_in)) AND (clock_out IS NULL OR isfinite(clock_out))
    AND (clock_out IS NULL OR (clock_in IS NOT NULL AND clock_out >= clock_in
      AND break_minutes*60::numeric <= EXTRACT(EPOCH FROM clock_out-clock_in)))) NOT VALID;

CREATE OR REPLACE FUNCTION public.attendance_guard_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
BEGIN
  IF NEW.id<>OLD.id OR NEW.org_id<>OLD.org_id OR NEW.staff_id<>OLD.staff_id OR NEW.attendance_date<>OLD.attendance_date THEN
    RAISE EXCEPTION 'Attendance identity is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.version<>OLD.version+1 THEN
    RAISE EXCEPTION 'Attendance version conflict' USING ERRCODE='40001';
  END IF;
  NEW.created_at:=OLD.created_at;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.attendance_guard_revision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER attendance_guard_revision BEFORE UPDATE ON public.staff_attendance
  FOR EACH ROW EXECUTE FUNCTION public.attendance_guard_revision();
