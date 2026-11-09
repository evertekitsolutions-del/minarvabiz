-- M18: public, opt-in social/storefront lead -> tenant CRM customer.
-- Anonymous access is limited to this validating RPC; private PII tables remain RLS-protected.
CREATE TABLE public.saas_marketing_leads(
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 storefront_id uuid NOT NULL REFERENCES public.saas_storefronts(id),
 customer_id uuid NOT NULL REFERENCES public.customers(id),
 buyer_name text NOT NULL CHECK (length(btrim(buyer_name)) BETWEEN 1 AND 120),
 buyer_phone text NOT NULL CHECK (buyer_phone ~ '^\+?[0-9]{10,15}$'),
 source text NOT NULL CHECK (source IN ('website','whatsapp','facebook','instagram')),
 message text NOT NULL DEFAULT '' CHECK(length(message)<=500),
 consent_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saas_marketing_leads_scope_idx
 ON public.saas_marketing_leads(org_id,created_at DESC);
CREATE INDEX saas_marketing_leads_throttle_idx
 ON public.saas_marketing_leads(storefront_id,buyer_phone,created_at DESC);
ALTER TABLE public.saas_marketing_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_marketing_leads_tenant_read
 ON public.saas_marketing_leads FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.organization_members m
   WHERE m.org_id=saas_marketing_leads.org_id
     AND m.user_id=(SELECT auth.uid())));
REVOKE ALL ON public.saas_marketing_leads FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.saas_marketing_leads TO authenticated;

CREATE FUNCTION public.saas_capture_storefront_lead(
 p_lead_id uuid,p_slug text,p_buyer_name text,p_buyer_phone text,
 p_source text,p_message text,p_marketing_consent boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_store public.saas_storefronts%ROWTYPE;
 v_existing public.saas_marketing_leads%ROWTYPE;
 v_customer uuid;
 v_name text := btrim(coalesce(p_buyer_name,''));
 v_message text := btrim(coalesce(p_message,''));
 v_hourly integer;
BEGIN
 IF p_marketing_consent IS DISTINCT FROM true
  OR p_lead_id IS NULL
  OR length(v_name) NOT BETWEEN 1 AND 120
  OR coalesce(p_buyer_phone,'') !~ '^\+?[0-9]{10,15}$'
  OR p_source NOT IN ('website','whatsapp','facebook','instagram')
  OR length(v_message)>500
 THEN
  RAISE EXCEPTION 'Invalid or non-consented lead' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_store FROM public.saas_storefronts
 WHERE slug=p_slug AND published IS TRUE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Public storefront unavailable' USING ERRCODE='42501';
 END IF;
 -- A stable request ID is replayable but cannot be reassigned to another tenant/payload.
 PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('marketing-lead-id:'||p_lead_id::text,0));
 SELECT * INTO v_existing FROM public.saas_marketing_leads WHERE id=p_lead_id;
 IF FOUND THEN
  IF v_existing.org_id<>v_store.org_id
   OR v_existing.storefront_id<>v_store.id
   OR v_existing.buyer_name<>v_name
   OR v_existing.buyer_phone<>p_buyer_phone
   OR v_existing.source<>p_source
   OR v_existing.message<>v_message THEN
   RAISE EXCEPTION 'Lead idempotency payload conflict' USING ERRCODE='23505';
  END IF;
  RETURN pg_catalog.jsonb_build_object('lead_id',p_lead_id,
   'customer_id',v_existing.customer_id,'idempotent',true);
 END IF;
 -- Serialize same-phone submissions and customer matching to avoid parallel duplicate CRM creation.
 PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('marketing-phone:'||v_store.org_id::text||':'||p_buyer_phone,0));
 SELECT count(*) INTO v_hourly FROM public.saas_marketing_leads
 WHERE storefront_id=v_store.id AND buyer_phone=p_buyer_phone
   AND created_at>pg_catalog.now()-interval '1 hour';
 IF v_hourly>=3 THEN
  RAISE EXCEPTION 'Too many lead requests' USING ERRCODE='42901';
 END IF;
 -- Storewide limit protects against bulk anonymous CRM pollution across many phone numbers.
 PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('marketing-store:'||v_store.id::text,0));
 SELECT count(*) INTO v_hourly FROM public.saas_marketing_leads
 WHERE storefront_id=v_store.id AND created_at>pg_catalog.now()-interval '1 hour';
 IF v_hourly>=50 THEN
  RAISE EXCEPTION 'Storefront lead capacity exceeded' USING ERRCODE='42901';
 END IF;
 SELECT id INTO v_customer FROM public.customers
 WHERE org_id=v_store.org_id AND phone=p_buyer_phone AND deleted_at IS NULL
 ORDER BY created_at,id LIMIT 1;
 IF v_customer IS NULL THEN
  INSERT INTO public.customers(org_id,name,phone,notes)
  VALUES(v_store.org_id,v_name,p_buyer_phone,
    'Storefront lead — marketing consent recorded in saas_marketing_leads')
  RETURNING id INTO v_customer;
 END IF;
 INSERT INTO public.saas_marketing_leads(
  id,org_id,storefront_id,customer_id,buyer_name,buyer_phone,source,message)
 VALUES(p_lead_id,v_store.org_id,v_store.id,v_customer,
   v_name,p_buyer_phone,p_source,v_message);
 RETURN pg_catalog.jsonb_build_object('lead_id',p_lead_id,
   'customer_id',v_customer,'idempotent',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.saas_capture_storefront_lead(uuid,text,text,text,text,text,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_capture_storefront_lead(uuid,text,text,text,text,text,boolean)
 TO anon,authenticated;