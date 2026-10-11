-- HR-005 source-only additive holiday policy authority.
-- DO NOT apply to production before reviewed rollout/Offline parity. No
-- statutory entitlement/payroll/roster mutation is enabled by this schema.
CREATE TABLE public.staff_holiday_rules (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  scope TEXT NOT NULL CHECK (scope IN ('country','organization','branch')),
  country_code TEXT,
  branch_id UUID REFERENCES public.branches(id),
  holiday_on DATE NOT NULL CHECK (holiday_on BETWEEN DATE '1900-01-01' AND DATE '9999-12-31'),
  repeats_annually BOOLEAN NOT NULL DEFAULT false,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120 AND name=btrim(name)),
  treatment TEXT NOT NULL CHECK (treatment IN ('non_working','informational')),
  active BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 2147483646),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  updated_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT holiday_rule_scope_exact CHECK (
    (scope='country' AND country_code ~ '^[A-Z]{2}$' AND branch_id IS NULL)
    OR (scope='organization' AND country_code IS NULL AND branch_id IS NULL)
    OR (scope='branch' AND country_code IS NULL AND branch_id IS NOT NULL)
  )
);
CREATE INDEX idx_holiday_rules_scope_date ON public.staff_holiday_rules(org_id,scope,holiday_on);
CREATE INDEX idx_holiday_rules_branch ON public.staff_holiday_rules(org_id,branch_id) WHERE branch_id IS NOT NULL;
ALTER TABLE public.staff_holiday_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_holiday_rules FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_holiday_rules FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.staff_holiday_rules TO authenticated;
GRANT ALL ON public.staff_holiday_rules TO service_role;
CREATE POLICY staff_holiday_manager_read ON public.staff_holiday_rules
 FOR SELECT TO authenticated USING (
  public.user_has_org_role(org_id,ARRAY['super_admin','admin','manager']::text[])
 );

-- History is append-only; a revision cannot silently rewrite another year's
-- holiday or erase a previous company/branch policy decision.
CREATE TABLE public.staff_holiday_rule_revisions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id UUID NOT NULL REFERENCES public.organizations(id),
 rule_id UUID NOT NULL REFERENCES public.staff_holiday_rules(id),
 version INTEGER NOT NULL CHECK(version>0),
 before_value JSONB,
 after_value JSONB NOT NULL,
 actor_id UUID NOT NULL REFERENCES auth.users(id),
 committed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(rule_id,version)
);
CREATE INDEX idx_holiday_revisions_org_rule ON public.staff_holiday_rule_revisions(org_id,rule_id,version DESC);
ALTER TABLE public.staff_holiday_rule_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_holiday_rule_revisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_holiday_rule_revisions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.staff_holiday_rule_revisions TO authenticated;
GRANT ALL ON public.staff_holiday_rule_revisions TO service_role;
CREATE POLICY staff_holiday_revisions_manager_read ON public.staff_holiday_rule_revisions
 FOR SELECT TO authenticated USING (
  public.user_has_org_role(org_id,ARRAY['super_admin','admin','manager']::text[])
 );

CREATE FUNCTION public.staff_holiday_rule_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.branch_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.branches b WHERE b.id=NEW.branch_id
   AND b.org_id=NEW.org_id AND b.deleted_at IS NULL
 ) THEN
  RAISE EXCEPTION 'Holiday branch belongs to another tenant or is archived'
   USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' THEN
   IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.scope IS DISTINCT FROM OLD.scope
     OR NEW.country_code IS DISTINCT FROM OLD.country_code
     OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.holiday_on IS DISTINCT FROM OLD.holiday_on
     OR NEW.repeats_annually IS DISTINCT FROM OLD.repeats_annually
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
     RAISE EXCEPTION 'Holiday historical scope and date are immutable; create a new rule'
       USING ERRCODE='23514';
   END IF;
   IF NEW.version<>OLD.version+1 THEN
     RAISE EXCEPTION 'Stale holiday revision' USING ERRCODE='40001';
   END IF;
   NEW.created_at:=OLD.created_at;
   NEW.updated_at:=clock_timestamp();
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_holiday_rule_guard()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER staff_holiday_rule_validate
 BEFORE INSERT OR UPDATE ON public.staff_holiday_rules FOR EACH ROW
 EXECUTE FUNCTION public.staff_holiday_rule_guard();

CREATE FUNCTION public.staff_holiday_history_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 RAISE EXCEPTION 'Immutable holiday change history cannot be modified'
  USING ERRCODE='23514';
END;
$$;
REVOKE ALL ON FUNCTION public.staff_holiday_history_immutable()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER staff_holiday_revision_immutable
 BEFORE UPDATE OR DELETE ON public.staff_holiday_rule_revisions FOR EACH ROW
 EXECUTE FUNCTION public.staff_holiday_history_immutable();

-- Revisioned admin/manager command. Every successful insert/update creates
-- both immutable history and audit in the SAME PostgreSQL transaction.
-- No computed payroll entitlement, automatic attendance or roster writes.
CREATE FUNCTION public.save_staff_holiday_rule(
 p_id UUID,p_scope TEXT,p_country_code TEXT,p_branch_id UUID,p_date DATE,
 p_repeats_annually BOOLEAN,p_name TEXT,p_treatment TEXT,p_active BOOLEAN,
 p_expected_version INTEGER
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
 authority RECORD;
 prior public.staff_holiday_rules;
 saved public.staff_holiday_rules;
 old_json JSONB:=NULL;
 action_name TEXT;
BEGIN
 SELECT * INTO STRICT authority FROM public.current_user_authorization();
 IF authority.auth_role NOT IN ('super_admin','admin','manager') THEN
   RAISE EXCEPTION 'Holiday rule manager permission denied' USING ERRCODE='42501';
 END IF;
 IF p_id IS NULL OR p_scope IS NULL OR p_scope NOT IN ('country','organization','branch')
   OR p_date IS NULL OR p_date NOT BETWEEN DATE '1900-01-01' AND DATE '9999-12-31'
   OR p_repeats_annually IS NULL OR p_active IS NULL
   OR p_expected_version IS NULL OR p_expected_version<0 OR p_expected_version>=2147483646
   OR p_treatment IS NULL OR p_treatment NOT IN ('non_working','informational')
   OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
   OR p_name<>btrim(p_name)
   OR NOT (
     (p_scope='country' AND p_country_code ~ '^[A-Z]{2}$' AND p_branch_id IS NULL)
     OR (p_scope='organization' AND p_country_code IS NULL AND p_branch_id IS NULL)
     OR (p_scope='branch' AND p_country_code IS NULL AND p_branch_id IS NOT NULL)
   ) THEN
   RAISE EXCEPTION 'Invalid explicit holiday scope, calendar rule or revision'
    USING ERRCODE='22023';
 END IF;
 IF p_branch_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.branches WHERE id=p_branch_id
     AND org_id=authority.auth_org_id AND deleted_at IS NULL
 ) THEN
   RAISE EXCEPTION 'Holiday branch is outside current tenant'
    USING ERRCODE='42501';
 END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(
    authority.auth_org_id::text||':holiday:'||p_id::text,0));
 SELECT * INTO prior FROM public.staff_holiday_rules
  WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
   IF prior.org_id<>authority.auth_org_id THEN
     RAISE EXCEPTION 'Holiday belongs to another tenant' USING ERRCODE='42501';
   END IF;
   IF prior.version<>p_expected_version THEN
     RETURN jsonb_build_object('accepted',false,'reason','stale_revision',
       'remote',to_jsonb(prior));
   END IF;
   IF prior.scope<>p_scope OR prior.country_code IS DISTINCT FROM p_country_code
     OR prior.branch_id IS DISTINCT FROM p_branch_id OR prior.holiday_on<>p_date
     OR prior.repeats_annually<>p_repeats_annually THEN
     RAISE EXCEPTION 'Holiday scope/date immutable; create a new reviewed rule'
       USING ERRCODE='23514';
   END IF;
   old_json:=to_jsonb(prior);
   UPDATE public.staff_holiday_rules
    SET name=p_name,treatment=p_treatment,active=p_active,
      updated_by=authority.auth_user_id,version=prior.version+1
    WHERE id=p_id RETURNING * INTO saved;
   action_name:='holiday.rule.update';
 ELSE
   IF p_expected_version<>0 THEN
     RETURN jsonb_build_object('accepted',false,'reason','not_found');
   END IF;
   INSERT INTO public.staff_holiday_rules(
     id,org_id,scope,country_code,branch_id,holiday_on,repeats_annually,
     name,treatment,active,version,created_by,updated_by
   ) VALUES (p_id,authority.auth_org_id,p_scope,p_country_code,p_branch_id,
    p_date,p_repeats_annually,p_name,p_treatment,p_active,1,
    authority.auth_user_id,authority.auth_user_id)
   RETURNING * INTO saved;
   action_name:='holiday.rule.create';
 END IF;
 INSERT INTO public.staff_holiday_rule_revisions(
   org_id,rule_id,version,before_value,after_value,actor_id
 ) VALUES (authority.auth_org_id,saved.id,saved.version,old_json,
   to_jsonb(saved),authority.auth_user_id);
 INSERT INTO public.audit_logs(
   org_id,user_id,action,table_name,record_id,old_value,new_value
 ) VALUES(authority.auth_org_id,authority.auth_user_id,action_name,
   'staff_holiday_rules',saved.id,old_json,to_jsonb(saved));
 RETURN jsonb_build_object('accepted',true,'record',to_jsonb(saved),
   'attendance_payroll_enforcement_active',false);
END;
$$;
REVOKE ALL ON FUNCTION public.save_staff_holiday_rule(
 UUID,TEXT,TEXT,UUID,DATE,BOOLEAN,TEXT,TEXT,BOOLEAN,INTEGER
) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_staff_holiday_rule(
 UUID,TEXT,TEXT,UUID,DATE,BOOLEAN,TEXT,TEXT,BOOLEAN,INTEGER
) TO authenticated;
COMMENT ON TABLE public.staff_holiday_rules IS
 'HR005 tenant-authorized configured holiday rules; no statutory/payroll inference or active roster guard.';
