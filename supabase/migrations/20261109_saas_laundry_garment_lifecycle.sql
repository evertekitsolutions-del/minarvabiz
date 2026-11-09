-- M14 online-only laundry/tailoring garment workflow.
-- MIT Laundry Lo service catalog source staged in PR #770; rates are authoritative
-- in public.laundry_service_rate_cards. No offline caches or gateway captures.
CREATE TABLE IF NOT EXISTS public.saas_laundry_garment_jobs (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  rate_card_id uuid NOT NULL REFERENCES public.laundry_service_rate_cards(id),
  tag_code text NOT NULL CHECK (tag_code ~ '^MB-[A-Z0-9]{10,32}$'),
  customer_name text NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 1 AND 160),
  garment_name text NOT NULL CHECK (length(btrim(garment_name)) BETWEEN 1 AND 160),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10000),
  stage text NOT NULL DEFAULT 'intake' CHECK (stage IN (
    'intake','tagged','washing','ironing','qc','ready','delivered')),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  tat_hours integer NOT NULL CHECK (tat_hours BETWEEN 1 AND 2160),
  notes text,
  due_at timestamptz NOT NULL,
  delivered_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id,tag_code)
);
CREATE INDEX IF NOT EXISTS saas_laundry_jobs_tenant_stage
  ON public.saas_laundry_garment_jobs(org_id,branch_id,stage,due_at);
ALTER TABLE public.saas_laundry_garment_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_laundry_jobs_select ON public.saas_laundry_garment_jobs
 FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.org_id = saas_laundry_garment_jobs.org_id
  AND m.user_id = (SELECT auth.uid())));
CREATE POLICY saas_laundry_jobs_insert ON public.saas_laundry_garment_jobs
 FOR INSERT TO authenticated WITH CHECK (
  created_by=(SELECT auth.uid()) AND public.user_has_org_role(
    org_id,ARRAY['super_admin','admin','manager']));
CREATE POLICY saas_laundry_jobs_update ON public.saas_laundry_garment_jobs
 FOR UPDATE TO authenticated
 USING (public.user_has_org_role(
    org_id,ARRAY['super_admin','admin','manager']))
 WITH CHECK (public.user_has_org_role(
    org_id,ARRAY['super_admin','admin','manager']));
REVOKE ALL ON public.saas_laundry_garment_jobs FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.saas_laundry_garment_jobs TO authenticated;

CREATE TABLE IF NOT EXISTS public.saas_laundry_garment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 job_id uuid NOT NULL REFERENCES public.saas_laundry_garment_jobs(id),
 stage text NOT NULL,
 version integer NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 event_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(job_id,version)
);
ALTER TABLE public.saas_laundry_garment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_laundry_events_select ON public.saas_laundry_garment_events
 FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.org_id=saas_laundry_garment_events.org_id
  AND m.user_id=(SELECT auth.uid())));
REVOKE ALL ON public.saas_laundry_garment_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.saas_laundry_garment_events TO authenticated;

CREATE OR REPLACE FUNCTION private.saas_laundry_enforce_and_log()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_expected text;
BEGIN
 IF TG_OP='UPDATE' THEN
   v_expected:=CASE OLD.stage
     WHEN 'intake' THEN 'tagged' WHEN 'tagged' THEN 'washing'
     WHEN 'washing' THEN 'ironing' WHEN 'ironing' THEN 'qc'
     WHEN 'qc' THEN 'ready' WHEN 'ready' THEN 'delivered' ELSE NULL END;
   IF NEW.stage IS DISTINCT FROM v_expected OR NEW.version<>OLD.version+1
    OR NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
    OR NEW.rate_card_id IS DISTINCT FROM OLD.rate_card_id
    OR NEW.tag_code IS DISTINCT FROM OLD.tag_code
    OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
    OR NEW.garment_name IS DISTINCT FROM OLD.garment_name
    OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
    OR NEW.tat_hours IS DISTINCT FROM OLD.tat_hours
    OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
     RAISE EXCEPTION 'Invalid or forged laundry garment state change'
      USING ERRCODE='23514';
   END IF;
   NEW.updated_at:=now();
   IF NEW.stage='delivered' THEN NEW.delivered_at:=now(); END IF;
   RETURN NEW;
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE OR REPLACE FUNCTION private.saas_laundry_event_after_write()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
 INSERT INTO public.saas_laundry_garment_events(
   org_id,branch_id,job_id,stage,version,actor_id)
 VALUES(NEW.org_id,NEW.branch_id,NEW.id,NEW.stage,NEW.version,(SELECT auth.uid()));
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.saas_laundry_enforce_and_log() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.saas_laundry_event_after_write() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS saas_laundry_guard_transition ON public.saas_laundry_garment_jobs;
CREATE TRIGGER saas_laundry_guard_transition BEFORE UPDATE ON public.saas_laundry_garment_jobs
 FOR EACH ROW EXECUTE FUNCTION private.saas_laundry_enforce_and_log();
DROP TRIGGER IF EXISTS saas_laundry_record_transition ON public.saas_laundry_garment_jobs;
CREATE TRIGGER saas_laundry_record_transition
 AFTER INSERT OR UPDATE ON public.saas_laundry_garment_jobs FOR EACH ROW
 EXECUTE FUNCTION private.saas_laundry_event_after_write();

CREATE OR REPLACE FUNCTION public.saas_laundry_intake(
 p_job_id uuid,p_rate_card_id uuid,p_customer_name text,
 p_garment_name text,p_tag_code text,p_quantity integer,p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE v_org uuid; v_user uuid := (SELECT auth.uid());
  v_rate public.laundry_service_rate_cards%ROWTYPE;
  v_job public.saas_laundry_garment_jobs%ROWTYPE;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(
  v_org,ARRAY['super_admin','admin','manager']) THEN
  RAISE EXCEPTION 'Not authorized for garment intake' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_rate FROM public.laundry_service_rate_cards
 WHERE id=p_rate_card_id AND org_id=v_org AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tenant rate card not found' USING ERRCODE='42501'; END IF;
 IF p_job_id IS NULL OR p_quantity NOT BETWEEN 1 AND 10000
 OR length(btrim(p_customer_name)) NOT BETWEEN 1 AND 160
 OR length(btrim(p_garment_name)) NOT BETWEEN 1 AND 160
 OR p_tag_code !~ '^MB-[A-Z0-9]{10,32}$' THEN
  RAISE EXCEPTION 'Invalid garment intake' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.saas_laundry_garment_jobs(
  id,org_id,branch_id,rate_card_id,tag_code,customer_name,garment_name,
  quantity,unit_price,tat_hours,notes,due_at,created_by)
 VALUES(p_job_id,v_org,v_rate.branch_id,p_rate_card_id,p_tag_code,
  btrim(p_customer_name),btrim(p_garment_name),p_quantity,v_rate.customer_rate,
  v_rate.tat_hours,p_notes,now()+(v_rate.tat_hours||' hours')::interval,v_user)
 ON CONFLICT (id) DO NOTHING;
 SELECT * INTO v_job FROM public.saas_laundry_garment_jobs
 WHERE id=p_job_id AND org_id=v_org;
 IF NOT FOUND OR v_job.tag_code IS DISTINCT FROM p_tag_code
  OR v_job.rate_card_id IS DISTINCT FROM p_rate_card_id
  OR v_job.quantity IS DISTINCT FROM p_quantity
  OR v_job.customer_name IS DISTINCT FROM btrim(p_customer_name)
  OR v_job.garment_name IS DISTINCT FROM btrim(p_garment_name)
  OR v_job.notes IS DISTINCT FROM p_notes THEN
  RAISE EXCEPTION 'Idempotency key collision or tenant mismatch' USING ERRCODE='23505';
 END IF;
 RETURN jsonb_build_object('job_id',v_job.id,'tag_code',v_job.tag_code,
  'stage',v_job.stage,'version',v_job.version,'due_at',v_job.due_at);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.saas_laundry_step(
 p_job_id uuid,p_expected_version integer,p_next_stage text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_job public.saas_laundry_garment_jobs%ROWTYPE;
 v_next text;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF NOT public.user_has_org_role(v_org,ARRAY['super_admin','admin','manager']) THEN
  RAISE EXCEPTION 'Not authorized for garment processing' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_job FROM public.saas_laundry_garment_jobs
 WHERE id=p_job_id AND org_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tenant garment job not found' USING ERRCODE='42501'; END IF;
 IF v_job.version=p_expected_version+1 AND v_job.stage=p_next_stage THEN
   RETURN jsonb_build_object('job_id',p_job_id,'stage',v_job.stage,
    'version',v_job.version,'idempotent',true);
 END IF;
 v_next:=CASE v_job.stage
  WHEN 'intake' THEN 'tagged' WHEN 'tagged' THEN 'washing'
  WHEN 'washing' THEN 'ironing' WHEN 'ironing' THEN 'qc'
  WHEN 'qc' THEN 'ready' WHEN 'ready' THEN 'delivered' ELSE NULL END;
 IF v_job.version<>p_expected_version OR v_next IS DISTINCT FROM p_next_stage THEN
  RAISE EXCEPTION 'Concurrent or invalid garment stage transition'
    USING ERRCODE='40001';
 END IF;
 UPDATE public.saas_laundry_garment_jobs SET stage=p_next_stage,version=version+1
 WHERE id=p_job_id AND org_id=v_org RETURNING * INTO v_job;
 RETURN jsonb_build_object('job_id',p_job_id,'stage',v_job.stage,
  'version',v_job.version,'idempotent',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.saas_laundry_intake(uuid,uuid,text,text,text,integer,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_laundry_intake(uuid,uuid,text,text,text,integer,text) TO authenticated;
REVOKE ALL ON FUNCTION public.saas_laundry_step(uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_laundry_step(uuid,integer,text) TO authenticated;
