-- HR-004: authenticated, audited, replay-safe workforce roster mutations.
-- All protected writes use the same tenant-authoritative RPC; direct DML remains denied.
-- No historical rows are modified by applying this migration.
CREATE TABLE IF NOT EXISTS public.staff_roster_event_receipts (
  event_id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  event_kind TEXT NOT NULL CHECK (event_kind IN ('shift','roster')),
  record_id UUID NOT NULL,
  device_id TEXT NOT NULL CHECK (length(device_id) BETWEEN 1 AND 200),
  sequence BIGINT NOT NULL CHECK (sequence > 0),
  request_json JSONB NOT NULL,
  committed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_staff_roster_event_receipts_org
  ON public.staff_roster_event_receipts(org_id);
ALTER TABLE public.staff_roster_event_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roster_event_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_roster_event_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_roster_event_receipts TO service_role;

-- The caller supplies an immutable UUID, device identity and monotonic device sequence.
-- Replaying exactly the same event never posts another roster change or audit.
CREATE OR REPLACE FUNCTION public.apply_staff_roster_event(
  p_kind TEXT, p_record JSONB, p_event_id UUID, p_device_id TEXT, p_sequence BIGINT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $roster$
DECLARE
  authority RECORD;
  prior_receipt public.staff_roster_event_receipts;
  previous_shift public.staff_shift_rules;
  previous_slot public.staff_roster_slots;
  v_id UUID;
  v_version INTEGER;
  v_branch UUID;
  v_staff UUID;
  v_template UUID;
  v_date DATE;
  v_status TEXT;
  v_name TEXT;
  v_start TIME WITHOUT TIME ZONE;
  v_end TIME WITHOUT TIME ZONE;
  v_break INTEGER;
  v_active BOOLEAN;
  v_prior JSONB := NULL;
  v_table TEXT;
  v_action TEXT;
  v_saved JSONB;
BEGIN
  IF p_kind NOT IN ('shift','roster') OR p_kind IS NULL
    OR p_record IS NULL OR jsonb_typeof(p_record) <> 'object'
    OR p_event_id IS NULL
    OR p_device_id IS NULL OR length(p_device_id) NOT BETWEEN 1 AND 200
    OR p_sequence IS NULL OR p_sequence < 1
    OR jsonb_typeof(p_record->'id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_record->'version') IS DISTINCT FROM 'number'
    OR p_record->>'id' IS NULL
    OR p_record->>'version' IS NULL THEN
    RAISE EXCEPTION 'Invalid workforce roster event' USING ERRCODE='22023';
  END IF;
  v_id := (p_record->>'id')::uuid;
  v_version := (p_record->>'version')::integer;
  IF v_version < 1 THEN RAISE EXCEPTION 'Invalid roster revision' USING ERRCODE='22023'; END IF;

  -- Caller identity comes from the authenticated JWT and authoritative
  -- organization-membership relation, never from untrusted event JSON.
  SELECT * INTO STRICT authority FROM public.current_user_authorization();
  IF authority.auth_role NOT IN ('super_admin','admin','manager') THEN
    RAISE EXCEPTION 'Workforce roster permission denied' USING ERRCODE='42501';
  END IF;
  IF NOT (p_record ? 'branchId') OR (p_record->'branchId' <> 'null'::jsonb
    AND jsonb_typeof(p_record->'branchId') IS DISTINCT FROM 'string') THEN
    RAISE EXCEPTION 'Invalid roster branch field' USING ERRCODE='22023';
  END IF;
  IF p_record->>'branchId' = '' THEN
    RAISE EXCEPTION 'Empty roster branch is invalid' USING ERRCODE='22023';
  END IF;
  v_branch := (p_record->>'branchId')::uuid;

  -- Serialize retries before inspecting identity; identical requests are
  -- acknowledged, altered payloads or device sequence are not.
  PERFORM pg_advisory_xact_lock(hashtextextended('roster-event:'||p_event_id::text, 0));
  SELECT * INTO prior_receipt FROM public.staff_roster_event_receipts
    WHERE event_id=p_event_id;
  IF FOUND THEN
    IF prior_receipt.org_id <> authority.auth_org_id
      OR prior_receipt.event_kind <> p_kind OR prior_receipt.request_json <> p_record
      OR prior_receipt.device_id <> p_device_id OR prior_receipt.sequence <> p_sequence THEN
      RAISE EXCEPTION 'Roster event identity conflict' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('accepted',true,'replayed',true,'id',prior_receipt.record_id);
  END IF;

  IF p_kind='shift' THEN
    IF jsonb_typeof(p_record->'name') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_record->'startTime') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_record->'endTime') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_record->'unpaidBreakMinutes') IS DISTINCT FROM 'number'
      OR jsonb_typeof(p_record->'active') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Invalid shift template fields' USING ERRCODE='22023';
    END IF;
    v_name := btrim(p_record->>'name');
    IF length(v_name) NOT BETWEEN 1 AND 120
      OR p_record->>'startTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      OR p_record->>'endTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'Invalid shift name or clock time' USING ERRCODE='22023';
    END IF;
    v_start := (p_record->>'startTime')::time;
    v_end := (p_record->>'endTime')::time;
    v_break := (p_record->>'unpaidBreakMinutes')::integer;
    v_active := (p_record->>'active')::boolean;
    v_table := 'staff_shift_rules';
    SELECT * INTO previous_shift FROM public.staff_shift_rules
      WHERE id=v_id AND org_id=authority.auth_org_id FOR UPDATE;
    IF FOUND THEN
      v_prior := to_jsonb(previous_shift);
      IF v_version <> previous_shift.version + 1 THEN
        RETURN jsonb_build_object('accepted',false,'remote',v_prior);
      END IF;
      UPDATE public.staff_shift_rules SET
        name=v_name,branch_id=v_branch,start_time=v_start,end_time=v_end,
        unpaid_break_minutes=v_break,active=v_active,version=v_version
        WHERE id=v_id AND org_id=authority.auth_org_id
        RETURNING to_jsonb(public.staff_shift_rules.*) INTO v_saved;
      v_action := 'roster.shift.update';
    ELSE
      IF v_version <> 1 THEN RETURN jsonb_build_object('accepted',false); END IF;
      INSERT INTO public.staff_shift_rules
        (id,org_id,branch_id,name,start_time,end_time,unpaid_break_minutes,active,version)
      VALUES (v_id,authority.auth_org_id,v_branch,v_name,v_start,v_end,v_break,v_active,1)
        RETURNING to_jsonb(public.staff_shift_rules.*) INTO v_saved;
      v_action := 'roster.shift.create';
    END IF;
  ELSE
    IF jsonb_typeof(p_record->'staffId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_record->'shiftRuleId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_record->'workDate') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_record->'status') IS DISTINCT FROM 'string'
      OR p_record->>'workDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}
      RAISE EXCEPTION 'Invalid roster assignment fields' USING ERRCODE='22023';
    END IF;
    v_staff := (p_record->>'staffId')::uuid;
    v_template := (p_record->>'shiftRuleId')::uuid;
    v_date := (p_record->>'workDate')::date;
    v_status := p_record->>'status';
    IF v_status NOT IN ('scheduled','cancelled') THEN
      RAISE EXCEPTION 'Invalid roster status' USING ERRCODE='22023';
    END IF;
    v_table := 'staff_roster_slots';

    -- This lock also prevents duplicate staff/day creates from another
    -- device while a previous request is being inspected.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(authority.auth_org_id::text||v_staff::text,0));
    SELECT * INTO previous_slot FROM public.staff_roster_slots
      WHERE id=v_id AND org_id=authority.auth_org_id FOR UPDATE;
    IF FOUND THEN
      v_prior := to_jsonb(previous_slot);
      IF v_staff IS DISTINCT FROM previous_slot.staff_id
        OR v_date IS DISTINCT FROM previous_slot.work_date
        OR v_branch IS DISTINCT FROM previous_slot.branch_id THEN
        RAISE EXCEPTION 'Roster identity, work date and branch are immutable' USING ERRCODE='23514';
      END IF;
      IF v_version <> previous_slot.version + 1 THEN
        RETURN jsonb_build_object('accepted',false,'remote',v_prior);
      END IF;
      UPDATE public.staff_roster_slots SET
        shift_rule_id=v_template,status=v_status,version=v_version
        WHERE id=v_id AND org_id=authority.auth_org_id
        RETURNING to_jsonb(public.staff_roster_slots.*) INTO v_saved;
      v_action := 'roster.slot.update';
    ELSE
      IF v_version <> 1 THEN RETURN jsonb_build_object('accepted',false); END IF;
      -- Conflicting same-day identities are reviewable rather than silently
      -- treated as a second copy of the same assignment.
      SELECT to_jsonb(slot) INTO v_prior FROM public.staff_roster_slots slot
        WHERE slot.org_id=authority.auth_org_id AND slot.staff_id=v_staff
          AND slot.work_date=v_date AND slot.shift_rule_id=v_template LIMIT 1;
      IF v_prior IS NOT NULL THEN
        RETURN jsonb_build_object('accepted',false,'remote',v_prior);
      END IF;
      INSERT INTO public.staff_roster_slots
        (id,org_id,staff_id,shift_rule_id,branch_id,work_date,status,version)
      VALUES (v_id,authority.auth_org_id,v_staff,v_template,v_branch,v_date,v_status,1)
        RETURNING to_jsonb(public.staff_roster_slots.*) INTO v_saved;
      v_action := 'roster.slot.create';
    END IF;
  END IF;

  INSERT INTO public.staff_roster_event_receipts
    (event_id,org_id,event_kind,record_id,device_id,sequence,request_json)
  VALUES (p_event_id,authority.auth_org_id,p_kind,v_id,p_device_id,p_sequence,p_record);
  INSERT INTO public.audit_logs(org_id,user_id,action,table_name,record_id,old_value,new_value)
  VALUES (authority.auth_org_id,authority.auth_user_id,v_action,v_table,v_id,v_prior,v_saved);

  RETURN jsonb_build_object('accepted',true,'replayed',false,'record',v_saved);
END;
$roster$;

REVOKE ALL ON FUNCTION public.apply_staff_roster_event(TEXT,JSONB,UUID,TEXT,BIGINT)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_staff_roster_event(TEXT,JSONB,UUID,TEXT,BIGINT)
  TO authenticated;
 THEN
      RAISE EXCEPTION 'Invalid roster assignment fields' USING ERRCODE='22023';
    END IF;
    v_staff := (p_record->>'staffId')::uuid;
    v_template := (p_record->>'shiftRuleId')::uuid;
    v_date := (p_record->>'workDate')::date;
    v_status := p_record->>'status';
    IF v_status NOT IN ('scheduled','cancelled') THEN
      RAISE EXCEPTION 'Invalid roster status' USING ERRCODE='22023';
    END IF;
    v_table := 'staff_roster_slots';

    -- This lock also prevents duplicate staff/day creates from another
    -- device while a previous request is being inspected.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(authority.auth_org_id::text||v_staff::text,0));
    SELECT * INTO previous_slot FROM public.staff_roster_slots
      WHERE id=v_id AND org_id=authority.auth_org_id FOR UPDATE;
    IF FOUND THEN
      v_prior := to_jsonb(previous_slot);
      IF v_version <> previous_slot.version + 1 THEN
        RETURN jsonb_build_object('accepted',false,'remote',v_prior);
      END IF;
      UPDATE public.staff_roster_slots SET
        shift_rule_id=v_template,status=v_status,version=v_version
        WHERE id=v_id AND org_id=authority.auth_org_id
        RETURNING to_jsonb(public.staff_roster_slots.*) INTO v_saved;
      v_action := 'roster.slot.update';
    ELSE
      IF v_version <> 1 THEN RETURN jsonb_build_object('accepted',false); END IF;
      -- Conflicting same-day identities are reviewable rather than silently
      -- treated as a second copy of the same assignment.
      SELECT to_jsonb(slot) INTO v_prior FROM public.staff_roster_slots slot
        WHERE slot.org_id=authority.auth_org_id AND slot.staff_id=v_staff
          AND slot.work_date=v_date AND slot.shift_rule_id=v_template LIMIT 1;
      IF v_prior IS NOT NULL THEN
        RETURN jsonb_build_object('accepted',false,'remote',v_prior);
      END IF;
      INSERT INTO public.staff_roster_slots
        (id,org_id,staff_id,shift_rule_id,branch_id,work_date,status,version)
      VALUES (v_id,authority.auth_org_id,v_staff,v_template,v_branch,v_date,v_status,1)
        RETURNING to_jsonb(public.staff_roster_slots.*) INTO v_saved;
      v_action := 'roster.slot.create';
    END IF;
  END IF;

  INSERT INTO public.staff_roster_event_receipts
    (event_id,org_id,event_kind,record_id,device_id,sequence,request_json)
  VALUES (p_event_id,authority.auth_org_id,p_kind,v_id,p_device_id,p_sequence,p_record);
  INSERT INTO public.audit_logs(org_id,user_id,action,table_name,record_id,old_value,new_value)
  VALUES (authority.auth_org_id,authority.auth_user_id,v_action,v_table,v_id,v_prior,v_saved);

  RETURN jsonb_build_object('accepted',true,'replayed',false,'record',v_saved);
END;
$roster$;

REVOKE ALL ON FUNCTION public.apply_staff_roster_event(TEXT,JSONB,UUID,TEXT,BIGINT)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_staff_roster_event(TEXT,JSONB,UUID,TEXT,BIGINT)
  TO authenticated;
