-- Additive attendance authority: no live rows are rewritten or deleted.
-- Reuse authoritative organization RBAC; membership alone cannot expose HR data.
DROP POLICY IF EXISTS staff_attendance_org_access ON public.staff_attendance;
DROP POLICY IF EXISTS staff_attendance_member_read ON public.staff_attendance;
CREATE POLICY staff_attendance_manager_select ON public.staff_attendance
 FOR SELECT TO authenticated USING (
 public.user_has_org_role(org_id, ARRAY['super_admin','admin','manager']::text[]));
REVOKE INSERT, UPDATE, DELETE ON public.staff_attendance FROM authenticated;

ALTER TABLE public.staff_attendance ADD CONSTRAINT staff_attendance_clock_order
 CHECK (clock_out IS NULL OR (clock_in IS NOT NULL AND clock_out >= clock_in)) NOT VALID;
ALTER TABLE public.staff_attendance ADD CONSTRAINT staff_attendance_break_duration
 CHECK (clock_in IS NULL OR clock_out IS NULL OR break_minutes * 60::bigint <= EXTRACT(EPOCH FROM clock_out-clock_in)) NOT VALID;

-- Private replay receipts are kept separate from the generic client-writable outbox.
CREATE TABLE public.staff_attendance_event_receipts (
 event_id UUID PRIMARY KEY,
 org_id UUID NOT NULL REFERENCES public.organizations(id),
 record_id UUID NOT NULL,
 device_id TEXT NOT NULL,
 sequence BIGINT NOT NULL CHECK (sequence > 0),
 request_json JSONB NOT NULL,
 committed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_attendance_event_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_attendance_event_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_attendance_event_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_attendance_event_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.apply_staff_attendance_event(
 p_record JSONB, p_event_id UUID, p_device_id TEXT, p_sequence BIGINT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
 attendance_auth RECORD;
 member public.staff_members;
 previous public.staff_attendance;
 receipt public.staff_attendance_event_receipts;
 target_id UUID := (p_record->>'id')::uuid;
 target_staff UUID := (p_record->>'staffId')::uuid;
 target_date DATE := (p_record->>'date')::date;
 target_branch UUID := NULLIF(p_record->>'branchId','')::uuid;
 target_version INTEGER := (p_record->>'version')::integer;
 target_clock_in TIMESTAMPTZ := NULLIF(p_record->>'clockIn','')::timestamptz;
 target_clock_out TIMESTAMPTZ := NULLIF(p_record->>'clockOut','')::timestamptz;
 target_break INTEGER := (p_record->>'breakMinutes')::integer;
 target_overtime INTEGER := (p_record->>'overtimeMinutes')::integer;
 remote_json JSONB;
BEGIN
 SELECT * INTO STRICT attendance_auth FROM public.current_user_authorization();
 IF attendance_auth.auth_role NOT IN ('super_admin','admin','manager') THEN
  RAISE EXCEPTION 'Attendance permission denied' USING ERRCODE='42501';
 END IF;
 IF p_event_id IS NULL OR p_device_id IS NULL OR length(p_device_id) NOT BETWEEN 1 AND 200
  OR p_sequence IS NULL OR p_sequence < 1 OR target_id IS NULL OR target_staff IS NULL
  OR target_date IS NULL OR target_version IS NULL OR target_version < 1
  OR target_break IS NULL OR target_overtime IS NULL
  OR p_record->>'date' !~ '^\d{4}-\d{2}-\d{2}$'
  OR p_record->>'status' IS NULL
  OR p_record->>'status' NOT IN ('present','absent','half_day','leave','holiday')
  OR (p_record->>'clockIn' IS NOT NULL AND p_record->>'clockIn' !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$')
  OR (p_record->>'clockOut' IS NOT NULL AND p_record->>'clockOut' !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$') THEN
  RAISE EXCEPTION 'Invalid attendance event';
 END IF;
 -- First lock event identity, then the staff/day; parallel retries cannot double-post.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));
 SELECT * INTO receipt FROM public.staff_attendance_event_receipts WHERE event_id=p_event_id;
 IF FOUND THEN
  IF receipt.org_id <> attendance_auth.auth_org_id OR receipt.request_json <> p_record
    OR receipt.device_id <> p_device_id OR receipt.sequence <> p_sequence THEN
   RAISE EXCEPTION 'Attendance event identity conflict';
  END IF;
  RETURN jsonb_build_object('accepted',true,'replayed',true);
 END IF;
 SELECT * INTO member FROM public.staff_members
  WHERE id=target_staff AND org_id=attendance_auth.auth_org_id AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Staff is unavailable in this organization' USING ERRCODE='42501'; END IF;
 IF target_branch IS NOT NULL THEN
  PERFORM 1 FROM public.branches WHERE id=target_branch AND org_id=attendance_auth.auth_org_id AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch is unavailable in this organization' USING ERRCODE='42501'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(attendance_auth.auth_org_id::text||target_staff::text||target_date::text, 0));
 SELECT * INTO previous FROM public.staff_attendance
  WHERE org_id=attendance_auth.auth_org_id AND staff_id=target_staff AND attendance_date=target_date FOR UPDATE;
 IF FOUND THEN
  IF target_branch IS DISTINCT FROM previous.branch_id THEN
   RAISE EXCEPTION 'Attendance history branch is immutable' USING ERRCODE='42501';
  END IF;
  IF previous.id <> target_id OR target_version <> previous.version+1 THEN
   remote_json := jsonb_build_object('id',previous.id,'staffId',previous.staff_id,'date',previous.attendance_date,
    'status',previous.status,'clockIn',previous.clock_in,'clockOut',previous.clock_out,
    'breakMinutes',previous.break_minutes,'overtimeMinutes',previous.overtime_minutes,
    'notes',previous.notes,'branchId',previous.branch_id,'version',previous.version,
    'createdAt',previous.created_at,'updatedAt',previous.updated_at);
   RETURN jsonb_build_object('accepted',false,'remote',remote_json);
  END IF;
  UPDATE public.staff_attendance SET status=p_record->>'status', clock_in=target_clock_in,
   clock_out=target_clock_out,break_minutes=target_break,overtime_minutes=target_overtime,
   notes=p_record->>'notes',branch_id=target_branch,version=target_version,updated_at=now()
   WHERE id=target_id AND org_id=attendance_auth.auth_org_id;
 ELSE
  IF member.branch_id IS NOT NULL AND target_branch IS DISTINCT FROM member.branch_id THEN
   RAISE EXCEPTION 'Attendance branch must match the staff branch' USING ERRCODE='42501';
  END IF;
  IF target_version <> 1 THEN RETURN jsonb_build_object('accepted',false); END IF;
  INSERT INTO public.staff_attendance(id,org_id,staff_id,attendance_date,status,clock_in,clock_out,
   break_minutes,overtime_minutes,notes,branch_id,version)
  VALUES(target_id,attendance_auth.auth_org_id,target_staff,target_date,p_record->>'status',target_clock_in,
   target_clock_out,target_break,target_overtime,p_record->>'notes',target_branch,1);
 END IF;
 INSERT INTO public.staff_attendance_event_receipts(event_id,org_id,record_id,device_id,sequence,request_json)
 VALUES(p_event_id,attendance_auth.auth_org_id,target_id,p_device_id,p_sequence,p_record);
 INSERT INTO public.audit_logs(org_id,user_id,action,table_name,record_id,old_value,new_value)
 VALUES(attendance_auth.auth_org_id,attendance_auth.auth_user_id,
  CASE WHEN previous.id IS NULL THEN 'attendance.create' ELSE 'attendance.update' END,
  'staff_attendance',target_id,CASE WHEN previous.id IS NULL THEN NULL ELSE to_jsonb(previous) END,p_record);
 RETURN jsonb_build_object('accepted',true,'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_staff_attendance_event(JSONB,UUID,TEXT,BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_staff_attendance_event(JSONB,UUID,TEXT,BIGINT) TO authenticated;
