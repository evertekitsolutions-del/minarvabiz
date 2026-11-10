-- M19 online SaaS field visits, checklists, evidence URLs, signature handover, AMC.
-- Additive; legacy field service modules remain independent and unchanged.
CREATE TABLE IF NOT EXISTS public.saas_field_visits(
 id uuid PRIMARY KEY,org_id uuid NOT NULL REFERENCES public.organizations(id),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 customer_id uuid NOT NULL REFERENCES public.customers(id),
 site_name text NOT NULL CHECK(length(site_name) BETWEEN 2 AND 180),
 service_kind text NOT NULL CHECK(service_kind IN('installation','repair','inspection','amc')),
 scheduled_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','completed','cancelled')),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS saas_field_visits_tenant_idx ON public.saas_field_visits(org_id,scheduled_at DESC);
CREATE TABLE IF NOT EXISTS public.saas_field_visit_events(
 id uuid PRIMARY KEY,
 visit_id uuid NOT NULL REFERENCES public.saas_field_visits(id),
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 event_type text NOT NULL CHECK(event_type IN('checklist','evidence','handover')),
 request_body jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saas_field_events_visit_idx ON public.saas_field_visit_events(org_id,visit_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS saas_field_one_handover_per_visit
 ON public.saas_field_visit_events(visit_id) WHERE event_type='handover';
CREATE TABLE IF NOT EXISTS public.saas_amc_agreements(
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 customer_id uuid NOT NULL REFERENCES public.customers(id),
 visit_id uuid REFERENCES public.saas_field_visits(id),
 starts_on date NOT NULL,ends_on date NOT NULL,
 annual_value numeric(14,2) NOT NULL CHECK(annual_value>=0),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','expired','cancelled')),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_on>=starts_on)
);
CREATE INDEX IF NOT EXISTS saas_amc_agreements_tenant_idx
 ON public.saas_amc_agreements(org_id,customer_id,ends_on);
ALTER TABLE public.saas_field_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_field_visit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_amc_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_field_visits_tenant_read ON public.saas_field_visits
 FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.organization_members m
 WHERE m.org_id=saas_field_visits.org_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY saas_field_visit_events_tenant_read ON public.saas_field_visit_events
 FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.organization_members m
 WHERE m.org_id=saas_field_visit_events.org_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY saas_amc_agreements_tenant_read ON public.saas_amc_agreements
 FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.organization_members m
 WHERE m.org_id=saas_amc_agreements.org_id AND m.user_id=(SELECT auth.uid())));
REVOKE ALL ON public.saas_field_visits,public.saas_field_visit_events,public.saas_amc_agreements
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.saas_field_visits,public.saas_field_visit_events,
 public.saas_amc_agreements TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_field_visit_create_once(
 p_visit_id uuid,p_branch_id uuid,p_customer_id uuid,
 p_site_name text,p_service_kind text,p_scheduled_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_user uuid:=(SELECT auth.uid());v_org uuid;
 v_old public.saas_field_visits%ROWTYPE;v_site text:=pg_catalog.btrim(p_site_name);
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR
 NOT public.user_has_org_role(v_org,ARRAY['super_admin','admin','manager']) THEN
  RAISE EXCEPTION 'Field service manager required' USING ERRCODE='42501';
 END IF;
 IF p_visit_id IS NULL OR p_customer_id IS NULL OR p_branch_id IS NULL
 OR length(v_site) NOT BETWEEN 2 AND 180
 OR p_scheduled_at IS NULL OR p_service_kind NOT IN('installation','repair','inspection','amc') THEN
  RAISE EXCEPTION 'Invalid field service visit' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=p_branch_id
 AND b.org_id=v_org AND b.is_active AND b.deleted_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM public.customers c WHERE c.id=p_customer_id
 AND c.org_id=v_org AND c.deleted_at IS NULL) THEN
  RAISE EXCEPTION 'Visit customer or branch not in tenant' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('saas-field-visit:'||p_visit_id::text,0));
 SELECT * INTO v_old FROM public.saas_field_visits WHERE id=p_visit_id;
 IF FOUND THEN
  IF v_old.org_id<>v_org OR v_old.branch_id<>p_branch_id OR
   v_old.customer_id<>p_customer_id OR v_old.site_name<>v_site OR
   v_old.service_kind<>p_service_kind OR v_old.scheduled_at<>p_scheduled_at THEN
   RAISE EXCEPTION 'Visit ID reused with a different payload' USING ERRCODE='23505';
  END IF;
  RETURN pg_catalog.jsonb_build_object('visit_id',p_visit_id,'status',v_old.status,'idempotent',true);
 END IF;
 INSERT INTO public.saas_field_visits(
 id,org_id,branch_id,customer_id,site_name,service_kind,scheduled_at,created_by)
 VALUES(p_visit_id,v_org,p_branch_id,p_customer_id,v_site,p_service_kind,p_scheduled_at,v_user);
 RETURN pg_catalog.jsonb_build_object('visit_id',p_visit_id,'status','scheduled','idempotent',false);
END;$fn$;

CREATE OR REPLACE FUNCTION public.saas_field_visit_event_once(
 p_event_id uuid,p_visit_id uuid,p_event_type text,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_user uuid:=(SELECT auth.uid());v_org uuid;
 v_visit public.saas_field_visits%ROWTYPE;
 v_prior public.saas_field_visit_events%ROWTYPE;
 v_item jsonb;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(
 v_org,ARRAY['super_admin','admin','manager']) THEN
  RAISE EXCEPTION 'Field event operator not authorized' USING ERRCODE='42501';
 END IF;
 IF p_event_id IS NULL OR p_visit_id IS NULL OR
 p_event_type NOT IN('checklist','evidence','handover') OR
 pg_catalog.jsonb_typeof(p_payload)<>'object' OR
 length(p_payload::text)>36000 THEN
  RAISE EXCEPTION 'Invalid field visit evidence' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_visit FROM public.saas_field_visits
 WHERE id=p_visit_id AND org_id=v_org FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Visit not in authorized tenant' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_prior FROM public.saas_field_visit_events WHERE id=p_event_id;
 IF FOUND THEN
  IF v_prior.org_id<>v_org OR v_prior.visit_id<>p_visit_id
   OR v_prior.event_type<>p_event_type OR v_prior.request_body IS DISTINCT FROM p_payload THEN
    RAISE EXCEPTION 'Event ID collision with distinct payload' USING ERRCODE='23505';
  END IF;
  RETURN pg_catalog.jsonb_build_object('event_id',p_event_id,'idempotent',true);
 END IF;
 IF v_visit.status<>'scheduled' THEN
  RAISE EXCEPTION 'Visit is not accepting new evidence' USING ERRCODE='23514';
 END IF;
 IF p_event_type='checklist' THEN
  IF pg_catalog.jsonb_typeof(p_payload->'items')<>'array' OR
   pg_catalog.jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Checklist must contain 1..30 items' USING ERRCODE='22023';
  END IF;
  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_payload->'items') LOOP
   IF length(pg_catalog.btrim(v_item->>'name')) NOT BETWEEN 1 AND 160
    OR pg_catalog.jsonb_typeof(v_item->'passed')<>'boolean' THEN
    RAISE EXCEPTION 'Invalid checklist item' USING ERRCODE='22023';
   END IF;
  END LOOP;
 ELSIF p_event_type='evidence' THEN
  IF p_payload->>'kind' NOT IN('photo','pdf') OR
    length(p_payload->>'url') NOT BETWEEN 12 AND 1500 OR
    p_payload->>'url' !~ '^https://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'Evidence requires HTTPS photo/PDF URL' USING ERRCODE='22023';
  END IF;
 ELSE
  IF length(pg_catalog.btrim(p_payload->>'signed_name')) NOT BETWEEN 2 AND 180 OR
    p_payload->>'consent' IS DISTINCT FROM 'true' OR
    length(p_payload->>'signature_png') NOT BETWEEN 32 AND 32000 OR
    p_payload->>'signature_png' !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' OR
    NOT EXISTS(SELECT 1 FROM public.saas_field_visit_events e
      WHERE e.visit_id=p_visit_id AND e.org_id=v_org AND e.event_type='checklist')
    OR NOT EXISTS(SELECT 1 FROM public.saas_field_visit_events e
      WHERE e.visit_id=p_visit_id AND e.org_id=v_org AND e.event_type='evidence') THEN
    RAISE EXCEPTION 'Handover needs consent, drawn signature, checklist and evidence'
    USING ERRCODE='22023';
  END IF;
 END IF;
 INSERT INTO public.saas_field_visit_events(
 id,visit_id,org_id,event_type,request_body,created_by)
 VALUES(p_event_id,p_visit_id,v_org,p_event_type,p_payload,v_user);
 IF p_event_type='handover' THEN
  UPDATE public.saas_field_visits SET status='completed',completed_at=now()
  WHERE id=p_visit_id AND org_id=v_org;
 END IF;
 RETURN pg_catalog.jsonb_build_object('event_id',p_event_id,
 'visit_id',p_visit_id,'event_type',p_event_type,'idempotent',false);
END;$fn$;

CREATE OR REPLACE FUNCTION public.saas_amc_create_once(
 p_agreement_id uuid,p_branch_id uuid,p_customer_id uuid,
 p_visit_id uuid,p_start date,p_end date,p_annual_value numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_user uuid:=(SELECT auth.uid());v_old public.saas_amc_agreements%ROWTYPE;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(
 v_org,ARRAY['super_admin','admin','manager']) THEN
 RAISE EXCEPTION 'AMC manager required' USING ERRCODE='42501';END IF;
 IF p_agreement_id IS NULL OR p_customer_id IS NULL OR p_branch_id IS NULL
  OR p_start IS NULL OR p_end IS NULL OR p_end<p_start
  OR p_annual_value IS NULL OR p_annual_value<0 OR p_annual_value>999999999 OR
  round(p_annual_value,2)<>p_annual_value THEN
 RAISE EXCEPTION 'Invalid AMC agreement' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.customers c WHERE c.id=p_customer_id AND c.org_id=v_org)
 OR NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=p_branch_id AND b.org_id=v_org)
 OR (p_visit_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.saas_field_visits v
 WHERE v.id=p_visit_id AND v.org_id=v_org AND v.customer_id=p_customer_id)) THEN
 RAISE EXCEPTION 'AMC party or visit outside tenant' USING ERRCODE='42501';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas-amc:'||p_agreement_id::text,0));
 SELECT * INTO v_old FROM public.saas_amc_agreements WHERE id=p_agreement_id;
 IF FOUND THEN
  IF v_old.org_id<>v_org OR v_old.branch_id<>p_branch_id OR v_old.customer_id<>p_customer_id
  OR v_old.visit_id IS DISTINCT FROM p_visit_id OR v_old.starts_on<>p_start
  OR v_old.ends_on<>p_end OR v_old.annual_value<>p_annual_value THEN
  RAISE EXCEPTION 'AMC ID payload conflict' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('agreement_id',p_agreement_id,'idempotent',true);
 END IF;
 INSERT INTO public.saas_amc_agreements(
 id,org_id,branch_id,customer_id,visit_id,starts_on,ends_on,annual_value,created_by)
 VALUES(p_agreement_id,v_org,p_branch_id,p_customer_id,p_visit_id,p_start,p_end,p_annual_value,v_user);
 RETURN pg_catalog.jsonb_build_object('agreement_id',p_agreement_id,'idempotent',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.saas_field_visit_create_once(uuid,uuid,uuid,text,text,timestamptz)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.saas_field_visit_event_once(uuid,uuid,text,jsonb)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.saas_amc_create_once(uuid,uuid,uuid,uuid,date,date,numeric)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_field_visit_create_once(uuid,uuid,uuid,text,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_field_visit_event_once(uuid,uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_amc_create_once(uuid,uuid,uuid,uuid,date,date,numeric) TO authenticated;
