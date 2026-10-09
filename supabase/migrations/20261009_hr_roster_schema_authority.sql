-- HR-004: tenant-isolated shift templates and staff rosters.
-- Additive schema; no existing table/row is rewritten.
-- User edits MUST use a later audited RPC; direct authenticated DML is denied.
CREATE TABLE IF NOT EXISTS public.staff_shift_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  branch_id UUID REFERENCES public.branches(id),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  start_time TIME WITHOUT TIME ZONE NOT NULL,
  end_time TIME WITHOUT TIME ZONE NOT NULL,
  unpaid_break_minutes INTEGER NOT NULL CHECK (unpaid_break_minutes >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT roster_shift_break_valid CHECK (
    unpaid_break_minutes <
      (EXTRACT(HOUR FROM end_time)::integer*60 + EXTRACT(MINUTE FROM end_time)::integer)
      -(EXTRACT(HOUR FROM start_time)::integer*60 + EXTRACT(MINUTE FROM start_time)::integer)
      + CASE WHEN end_time <= start_time THEN 1440 ELSE 0 END
  )
);
CREATE INDEX IF NOT EXISTS idx_staff_shift_rules_org_branch ON public.staff_shift_rules(org_id,branch_id);

CREATE TABLE IF NOT EXISTS public.staff_roster_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  staff_id UUID NOT NULL REFERENCES public.staff_members(id) ON DELETE RESTRICT,
  shift_rule_id UUID NOT NULL REFERENCES public.staff_shift_rules(id) ON DELETE RESTRICT,
  branch_id UUID REFERENCES public.branches(id),
  work_date DATE NOT NULL CHECK (work_date BETWEEN DATE '1900-01-01' AND DATE '9999-12-31'),
  status TEXT NOT NULL CHECK (status IN ('scheduled','cancelled')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT staff_roster_unique_shift_day UNIQUE(org_id,staff_id,work_date,shift_rule_id)
);
CREATE INDEX IF NOT EXISTS idx_staff_roster_org_staff_date ON public.staff_roster_slots(org_id,staff_id,work_date);
CREATE INDEX IF NOT EXISTS idx_staff_roster_org_branch_date ON public.staff_roster_slots(org_id,branch_id,work_date);
CREATE INDEX IF NOT EXISTS idx_staff_roster_template_fk ON public.staff_roster_slots(shift_rule_id);

ALTER TABLE public.staff_shift_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_shift_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roster_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roster_slots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_shift_rules, public.staff_roster_slots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_shift_rules, public.staff_roster_slots TO authenticated;
GRANT ALL ON public.staff_shift_rules, public.staff_roster_slots TO service_role;

DROP POLICY IF EXISTS staff_shift_rules_manager_read ON public.staff_shift_rules;
CREATE POLICY staff_shift_rules_manager_read ON public.staff_shift_rules FOR SELECT TO authenticated
 USING (public.user_has_org_role(org_id,ARRAY['super_admin','admin','manager']::text[]));
DROP POLICY IF EXISTS staff_roster_slots_manager_read ON public.staff_roster_slots;
CREATE POLICY staff_roster_slots_manager_read ON public.staff_roster_slots FOR SELECT TO authenticated
 USING (public.user_has_org_role(org_id,ARRAY['super_admin','admin','manager']::text[]));

-- Trigger remains a second tenant/integrity boundary even for privileged RPCs.
CREATE OR REPLACE FUNCTION public.staff_roster_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $guard$
DECLARE
  template public.staff_shift_rules;
  person public.staff_members;
  conflicting UUID;
  start_at TIMESTAMP;
  finish_at TIMESTAMP;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      RAISE EXCEPTION 'Roster tenant and identity are immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'Roster revision conflict' USING ERRCODE='40001';
    END IF;
    NEW.created_at:=OLD.created_at;
    NEW.updated_at:=clock_timestamp();
  END IF;
  IF TG_TABLE_NAME='staff_shift_rules' THEN
    IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.branches WHERE id=NEW.branch_id AND org_id=NEW.org_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Shift branch does not belong to tenant' USING ERRCODE='23514';
    END IF;
    IF TG_OP = 'UPDATE' AND
      (NEW.start_time IS DISTINCT FROM OLD.start_time OR NEW.end_time IS DISTINCT FROM OLD.end_time
        OR NEW.unpaid_break_minutes IS DISTINCT FROM OLD.unpaid_break_minutes
        OR NEW.branch_id IS DISTINCT FROM OLD.branch_id)
      AND EXISTS (SELECT 1 FROM public.staff_roster_slots WHERE shift_rule_id=NEW.id) THEN
      RAISE EXCEPTION 'Historical shift timings and branch are immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND
      (NEW.staff_id IS DISTINCT FROM OLD.staff_id OR NEW.work_date IS DISTINCT FROM OLD.work_date
        OR NEW.branch_id IS DISTINCT FROM OLD.branch_id) THEN
    RAISE EXCEPTION 'Roster staff/date/branch are immutable' USING ERRCODE='23514';
  END IF;
  SELECT * INTO template FROM public.staff_shift_rules
    WHERE id=NEW.shift_rule_id AND org_id=NEW.org_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift template belongs to another tenant' USING ERRCODE='23514'; END IF;
  SELECT * INTO person FROM public.staff_members
    WHERE id=NEW.staff_id AND org_id=NEW.org_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff belongs to another tenant' USING ERRCODE='23514'; END IF;
  IF template.branch_id IS NOT NULL AND NEW.branch_id IS DISTINCT FROM template.branch_id THEN
    RAISE EXCEPTION 'Shift and roster branches disagree' USING ERRCODE='23514';
  END IF;
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id=NEW.branch_id AND org_id=NEW.org_id AND deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Roster branch belongs to another tenant' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' AND (
    person.deleted_at IS NOT NULL OR person.status <> 'active'
    OR NEW.branch_id IS DISTINCT FROM person.branch_id
  ) THEN RAISE EXCEPTION 'Staff unavailable or transferred to another branch' USING ERRCODE='23514'; END IF;
  IF NEW.status='scheduled' AND NOT template.active THEN
    RAISE EXCEPTION 'Inactive shift cannot be scheduled' USING ERRCODE='23514';
  END IF;
  IF NEW.status='scheduled' THEN
    -- Lock per staff, not per day: overnight and adjacent-day changes also serialize.
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.org_id::text||NEW.staff_id::text,0));
    start_at:=NEW.work_date + template.start_time;
    finish_at:=NEW.work_date + template.end_time
      + CASE WHEN template.end_time<=template.start_time THEN interval '1 day' ELSE interval '0 days' END;
    SELECT other.id INTO conflicting
      FROM public.staff_roster_slots other
      JOIN public.staff_shift_rules other_rule ON other_rule.id=other.shift_rule_id
      WHERE other.org_id=NEW.org_id AND other.staff_id=NEW.staff_id
        AND other.id<>NEW.id AND other.status='scheduled'
        AND other.work_date BETWEEN NEW.work_date-1 AND NEW.work_date+1
        AND start_at < (other.work_date + other_rule.end_time +
            CASE WHEN other_rule.end_time<=other_rule.start_time THEN interval '1 day' ELSE interval '0 days' END)
        AND (other.work_date + other_rule.start_time) < finish_at
      LIMIT 1;
    IF conflicting IS NOT NULL THEN
      RAISE EXCEPTION 'Roster shift overlaps existing assignment %',conflicting USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION public.staff_roster_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS staff_shift_rules_guard ON public.staff_shift_rules;
CREATE TRIGGER staff_shift_rules_guard BEFORE INSERT OR UPDATE ON public.staff_shift_rules
 FOR EACH ROW EXECUTE FUNCTION public.staff_roster_guard();
DROP TRIGGER IF EXISTS staff_roster_slots_guard ON public.staff_roster_slots;
CREATE TRIGGER staff_roster_slots_guard BEFORE INSERT OR UPDATE ON public.staff_roster_slots
 FOR EACH ROW EXECUTE FUNCTION public.staff_roster_guard();
