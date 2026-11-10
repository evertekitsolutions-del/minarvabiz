-- M18: opt-in CRM lead campaign queue and read-only promo validation.
-- No external sends, no payment capture, no unverified checkout discount.
CREATE TABLE IF NOT EXISTS public.saas_marketing_coupons(
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 storefront_id uuid NOT NULL REFERENCES public.saas_storefronts(id),
 code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{3,19}$'),
 discount_kind text NOT NULL CHECK(discount_kind IN('percent','fixed')),
 discount_value numeric(14,2) NOT NULL CHECK(discount_value>0),
 active boolean NOT NULL DEFAULT true,
 starts_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 CHECK(expires_at>starts_at),
 CHECK(discount_kind<>'percent' OR discount_value<=100),
 CHECK(discount_kind<>'fixed' OR discount_value<=10000),
 UNIQUE(storefront_id,code)
);
CREATE TABLE IF NOT EXISTS public.saas_marketing_campaign_templates(
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 storefront_id uuid NOT NULL REFERENCES public.saas_storefronts(id),
 name text NOT NULL CHECK(length(name) BETWEEN 3 AND 100),
 channel text NOT NULL CHECK(channel IN('whatsapp','email','sms')),
 body text NOT NULL CHECK(length(body) BETWEEN 10 AND 700),
 active boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE TABLE IF NOT EXISTS public.saas_marketing_campaign_trigger_log(
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 storefront_id uuid NOT NULL REFERENCES public.saas_storefronts(id),
 lead_id uuid NOT NULL REFERENCES public.saas_marketing_leads(id),
 template_id uuid NOT NULL REFERENCES public.saas_marketing_campaign_templates(id),
 body_snapshot text NOT NULL,
 channel text NOT NULL,
 delivery_state text NOT NULL DEFAULT 'queued_no_transport'
 CHECK(delivery_state='queued_no_transport'),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 UNIQUE(lead_id,template_id)
);
CREATE INDEX IF NOT EXISTS saas_marketing_coupons_active_idx
 ON public.saas_marketing_coupons(storefront_id,code) WHERE active=true;
CREATE INDEX IF NOT EXISTS saas_marketing_trigger_org_idx
 ON public.saas_marketing_campaign_trigger_log(org_id,created_at DESC);
ALTER TABLE public.saas_marketing_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_marketing_campaign_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_marketing_campaign_trigger_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_marketing_coupons_tenant_read ON public.saas_marketing_coupons
 FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.organization_members m
 WHERE m.org_id=saas_marketing_coupons.org_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY saas_marketing_templates_tenant_read ON public.saas_marketing_campaign_templates
 FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.organization_members m
 WHERE m.org_id=saas_marketing_campaign_templates.org_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY saas_marketing_triggers_tenant_read ON public.saas_marketing_campaign_trigger_log
 FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.organization_members m
 WHERE m.org_id=saas_marketing_campaign_trigger_log.org_id AND m.user_id=(SELECT auth.uid())));
REVOKE ALL ON public.saas_marketing_coupons,public.saas_marketing_campaign_templates,
 public.saas_marketing_campaign_trigger_log FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.saas_marketing_coupons,public.saas_marketing_campaign_templates,
 public.saas_marketing_campaign_trigger_log TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_create_store_coupon_once(
 p_coupon_id uuid,p_store_id uuid,p_code text,p_discount_kind text,
 p_discount_value numeric,p_valid_from timestamptz,p_valid_until timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_user uuid:=(SELECT auth.uid());
 v_code text:=upper(pg_catalog.btrim(coalesce(p_code,'')));
 v_prior public.saas_marketing_coupons%ROWTYPE;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(
  v_org,ARRAY['super_admin','admin','manager']) THEN
  RAISE EXCEPTION 'Marketing administrator required' USING ERRCODE='42501';END IF;
 IF p_coupon_id IS NULL OR p_store_id IS NULL OR
 v_code !~ '^[A-Z0-9][A-Z0-9_-]{3,19}$'
 OR p_discount_kind NOT IN('percent','fixed')
 OR p_discount_value IS NULL OR p_discount_value<=0
 OR round(p_discount_value,2)<>p_discount_value OR
 (p_discount_kind='percent' AND p_discount_value>100) OR
 (p_discount_kind='fixed' AND p_discount_value>10000)
 OR p_valid_until<=p_valid_from OR p_valid_from IS NULL OR p_valid_until IS NULL THEN
  RAISE EXCEPTION 'Invalid coupon' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.saas_storefronts s
 WHERE s.id=p_store_id AND s.org_id=v_org) THEN
  RAISE EXCEPTION 'Coupon store outside tenant' USING ERRCODE='42501';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('saas-coupon:'||p_coupon_id::text,0));
 SELECT * INTO v_prior FROM public.saas_marketing_coupons WHERE id=p_coupon_id;
 IF FOUND THEN
  IF v_prior.org_id<>v_org OR v_prior.storefront_id<>p_store_id OR
    v_prior.code<>v_code OR v_prior.discount_kind<>p_discount_kind OR
    v_prior.discount_value<>p_discount_value OR v_prior.starts_at<>p_valid_from OR
    v_prior.expires_at<>p_valid_until THEN
    RAISE EXCEPTION 'Coupon id reused with different payload' USING ERRCODE='23505';END IF;
  RETURN pg_catalog.jsonb_build_object('coupon_id',p_coupon_id,'idempotent',true);
 END IF;
 INSERT INTO public.saas_marketing_coupons(
 id,org_id,storefront_id,code,discount_kind,discount_value,
 starts_at,expires_at,created_by)
 VALUES(p_coupon_id,v_org,p_store_id,v_code,p_discount_kind,p_discount_value,
 p_valid_from,p_valid_until,v_user);
 RETURN pg_catalog.jsonb_build_object('coupon_id',p_coupon_id,'idempotent',false);
END;$fn$;

CREATE OR REPLACE FUNCTION public.saas_preview_store_coupon(
 p_slug text,p_code text,p_cart_gross numeric
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_store_id uuid;v_coupon public.saas_marketing_coupons%ROWTYPE;
 v_discount numeric(14,2);v_code text:=upper(pg_catalog.btrim(coalesce(p_code,'')));
BEGIN
 IF p_slug IS NULL OR length(p_slug)>48 OR
 v_code !~ '^[A-Z0-9][A-Z0-9_-]{3,19}$'
 OR p_cart_gross IS NULL OR p_cart_gross<0 OR p_cart_gross>150000
 OR round(p_cart_gross,2)<>p_cart_gross THEN
  RAISE EXCEPTION 'Invalid coupon preview input' USING ERRCODE='22023';END IF;
 SELECT id INTO v_store_id FROM public.saas_storefronts
  WHERE slug=p_slug AND published IS TRUE;
 IF NOT FOUND THEN
  RETURN pg_catalog.jsonb_build_object('eligible',false,'discount',0,'preview_only',true);
 END IF;
 SELECT * INTO v_coupon FROM public.saas_marketing_coupons
  WHERE storefront_id=v_store_id AND code=v_code AND active=true
   AND starts_at<=pg_catalog.now() AND expires_at>pg_catalog.now();
 IF NOT FOUND THEN
  RETURN pg_catalog.jsonb_build_object('eligible',false,'discount',0,'preview_only',true);
 END IF;
 v_discount:=CASE WHEN v_coupon.discount_kind='percent'
  THEN round(p_cart_gross*v_coupon.discount_value/100,2)
  ELSE least(v_coupon.discount_value,p_cart_gross) END;
 RETURN pg_catalog.jsonb_build_object('eligible',true,
  'discount',v_discount,'preview_only',true,'code',v_code);
END;$fn$;

CREATE OR REPLACE FUNCTION public.saas_create_campaign_template_once(
 p_template_id uuid,p_store_id uuid,p_name text,p_channel text,p_body text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_user uuid:=(SELECT auth.uid());
 v_prior public.saas_marketing_campaign_templates%ROWTYPE;
 v_name text:=pg_catalog.btrim(coalesce(p_name,''));
 v_body text:=pg_catalog.btrim(coalesce(p_body,''));
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(
  v_org,ARRAY['super_admin','admin','manager']) THEN
  RAISE EXCEPTION 'Campaign administrator required' USING ERRCODE='42501';END IF;
 IF p_template_id IS NULL OR p_store_id IS NULL OR
 length(v_name) NOT BETWEEN 3 AND 100 OR
 length(v_body) NOT BETWEEN 10 AND 700 OR
 p_channel NOT IN('whatsapp','email','sms') OR
 NOT EXISTS(SELECT 1 FROM public.saas_storefronts
 WHERE id=p_store_id AND org_id=v_org) THEN
  RAISE EXCEPTION 'Invalid campaign template or tenant' USING ERRCODE='22023';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
 pg_catalog.hashtextextended('saas-campaign-template:'||p_template_id::text,0));
 SELECT * INTO v_prior FROM public.saas_marketing_campaign_templates WHERE id=p_template_id;
 IF FOUND THEN
  IF v_prior.org_id<>v_org OR v_prior.storefront_id<>p_store_id OR
   v_prior.name<>v_name OR v_prior.channel<>p_channel OR v_prior.body<>v_body THEN
    RAISE EXCEPTION 'Campaign ID collision' USING ERRCODE='23505';END IF;
  RETURN pg_catalog.jsonb_build_object('template_id',p_template_id,'idempotent',true);
 END IF;
 INSERT INTO public.saas_marketing_campaign_templates(
 id,org_id,storefront_id,name,channel,body,created_by)
 VALUES(p_template_id,v_org,p_store_id,v_name,p_channel,v_body,v_user);
 RETURN pg_catalog.jsonb_build_object('template_id',p_template_id,'idempotent',false);
END;$fn$;

CREATE OR REPLACE FUNCTION public.saas_queue_lead_campaign_once(
 p_trigger_id uuid,p_lead_id uuid,p_template_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_user uuid:=(SELECT auth.uid());
 v_lead public.saas_marketing_leads%ROWTYPE;
 v_template public.saas_marketing_campaign_templates%ROWTYPE;
 v_old public.saas_marketing_campaign_trigger_log%ROWTYPE;
 v_snapshot text;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(
  v_org,ARRAY['super_admin','admin','manager']) THEN
  RAISE EXCEPTION 'Campaign trigger administrator required' USING ERRCODE='42501';END IF;
 IF p_trigger_id IS NULL OR p_lead_id IS NULL OR p_template_id IS NULL THEN
  RAISE EXCEPTION 'Missing campaign trigger identifiers' USING ERRCODE='22023';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('saas-lead-campaign:'||p_lead_id::text||':'||p_template_id::text,0));
 SELECT * INTO v_old FROM public.saas_marketing_campaign_trigger_log WHERE id=p_trigger_id;
 IF FOUND THEN
  IF v_old.org_id<>v_org OR v_old.lead_id<>p_lead_id OR
   v_old.template_id<>p_template_id THEN
   RAISE EXCEPTION 'Campaign trigger ID collision' USING ERRCODE='23505';END IF;
  RETURN pg_catalog.jsonb_build_object('trigger_id',p_trigger_id,
   'delivery_state','queued_no_transport','idempotent',true);
 END IF;
 SELECT * INTO v_lead FROM public.saas_marketing_leads
 WHERE id=p_lead_id AND org_id=v_org AND consent_at IS NOT NULL;
 SELECT * INTO v_template FROM public.saas_marketing_campaign_templates
 WHERE id=p_template_id AND org_id=v_org AND active=true
  AND storefront_id=v_lead.storefront_id;
 IF v_lead.id IS NULL OR v_template.id IS NULL THEN
  RAISE EXCEPTION 'Campaign lead consent/template tenant mismatch' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.saas_marketing_campaign_trigger_log
 WHERE lead_id=p_lead_id AND template_id=p_template_id) THEN
  RAISE EXCEPTION 'Campaign already queued for this lead' USING ERRCODE='23505';END IF;
 IF (SELECT count(*) FROM public.saas_marketing_campaign_trigger_log
 WHERE org_id=v_org AND created_at>pg_catalog.now()-interval '1 day')>=1000 THEN
  RAISE EXCEPTION 'Marketing daily queue cap exceeded' USING ERRCODE='42901';END IF;
 v_snapshot:=pg_catalog.replace(v_template.body,'{{name}}',v_lead.buyer_name);
 INSERT INTO public.saas_marketing_campaign_trigger_log(
 id,org_id,storefront_id,lead_id,template_id,body_snapshot,channel,created_by)
 VALUES(p_trigger_id,v_org,v_lead.storefront_id,p_lead_id,
 v_template.id,v_snapshot,v_template.channel,v_user);
 RETURN pg_catalog.jsonb_build_object('trigger_id',p_trigger_id,
  'delivery_state','queued_no_transport','idempotent',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.saas_create_store_coupon_once(uuid,uuid,text,text,numeric,timestamptz,timestamptz)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.saas_preview_store_coupon(text,text,numeric)
 FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.saas_create_campaign_template_once(uuid,uuid,text,text,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.saas_queue_lead_campaign_once(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_create_store_coupon_once(uuid,uuid,text,text,numeric,timestamptz,timestamptz)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_preview_store_coupon(text,text,numeric) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_create_campaign_template_once(uuid,uuid,text,text,text)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_queue_lead_campaign_once(uuid,uuid,uuid)
 TO authenticated;
