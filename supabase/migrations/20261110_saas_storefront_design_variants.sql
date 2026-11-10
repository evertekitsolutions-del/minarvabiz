-- M16 public store design & variant-safe catalog.
-- Add only sanitized publicly intended metadata. Authoritative products remain RLS-private.
ALTER TABLE public.saas_storefronts
 ADD COLUMN IF NOT EXISTS seo_title text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS seo_description text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS banner_url text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT '#1760e6';
ALTER TABLE public.saas_storefront_listings
 ADD COLUMN IF NOT EXISTS variant_parent_id uuid,
 ADD COLUMN IF NOT EXISTS variant_parent_name text,
 ADD COLUMN IF NOT EXISTS variant_size text,
 ADD COLUMN IF NOT EXISTS variant_color text,
 ADD COLUMN IF NOT EXISTS variant_fabric text;

CREATE TABLE IF NOT EXISTS public.saas_storefront_design_receipts(
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 storefront_id uuid NOT NULL REFERENCES public.saas_storefronts(id),
 request_body jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.saas_storefront_design_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_storefront_design_receipts_tenant_read
 ON public.saas_storefront_design_receipts FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.organization_members m
 WHERE m.org_id=saas_storefront_design_receipts.org_id AND m.user_id=(SELECT auth.uid())));
REVOKE ALL ON public.saas_storefront_design_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.saas_storefront_design_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_storefront_variant_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_product public.products%ROWTYPE;v_parent text;
BEGIN
 SELECT * INTO v_product FROM public.products p
 WHERE p.id=NEW.product_id AND p.org_id=NEW.org_id AND p.deleted_at IS NULL;
 IF NOT FOUND OR v_product.has_variants IS TRUE THEN
  RAISE EXCEPTION 'Listing product must be saleable tenant variant' USING ERRCODE='42501';
 END IF;
 SELECT p.name INTO v_parent FROM public.products p
 WHERE p.id=v_product.parent_product_id AND p.org_id=NEW.org_id AND p.deleted_at IS NULL;
 NEW.variant_parent_id:=coalesce(v_product.parent_product_id,v_product.id);
 NEW.variant_parent_name:=coalesce(v_parent,v_product.name);
 NEW.variant_size:=nullif(pg_catalog.btrim(v_product.size),'');
 NEW.variant_color:=nullif(pg_catalog.btrim(v_product.color),'');
 NEW.variant_fabric:=nullif(pg_catalog.btrim(v_product.fabric),'');
 RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION public.saas_storefront_variant_metadata() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS saas_storefront_variant_metadata_trg ON public.saas_storefront_listings;
CREATE TRIGGER saas_storefront_variant_metadata_trg
 BEFORE INSERT OR UPDATE ON public.saas_storefront_listings
 FOR EACH ROW EXECUTE FUNCTION public.saas_storefront_variant_metadata();
-- Backfill existing listings, no inventory or price changes.
UPDATE public.saas_storefront_listings SET updated_at=updated_at;

CREATE OR REPLACE FUNCTION public.saas_storefront_update_design_once(
 p_update_id uuid,p_storefront_id uuid,p_design jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_user uuid:=(SELECT auth.uid());
 v_store public.saas_storefronts%ROWTYPE;
 v_prior public.saas_storefront_design_receipts%ROWTYPE;
 v_title text;v_description text;v_banner text;v_accent text;
 v_request jsonb;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(
 v_org,ARRAY['super_admin','admin','manager']) THEN
 RAISE EXCEPTION 'Store design admin required' USING ERRCODE='42501';END IF;
 IF p_update_id IS NULL OR p_storefront_id IS NULL OR
 pg_catalog.jsonb_typeof(p_design)<>'object' THEN
 RAISE EXCEPTION 'Invalid store design input' USING ERRCODE='22023';END IF;
 v_title:=pg_catalog.btrim(coalesce(p_design->>'seo_title',''));
 v_description:=pg_catalog.btrim(coalesce(p_design->>'seo_description',''));
 v_banner:=pg_catalog.btrim(coalesce(p_design->>'banner_url',''));
 v_accent:=coalesce(p_design->>'accent_color','#1760e6');
 IF length(v_title)>65 OR length(v_description)>160
 OR length(v_banner)>1500 OR
 (v_banner<>'' AND v_banner !~ '^https://[^[:space:]]+$')
 OR v_accent !~ '^#[0-9A-Fa-f]{6}$'
 OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_design))<>4 THEN
 RAISE EXCEPTION 'Invalid SEO/banner/accent design fields' USING ERRCODE='22023';END IF;
 v_request:=pg_catalog.jsonb_build_object('seo_title',v_title,
 'seo_description',v_description,'banner_url',v_banner,'accent_color',v_accent);
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('saas-store-design:'||p_update_id::text,0));
 SELECT * INTO v_prior FROM public.saas_storefront_design_receipts WHERE id=p_update_id;
 IF FOUND THEN
  IF v_prior.org_id<>v_org OR v_prior.storefront_id<>p_storefront_id
  OR v_prior.request_body IS DISTINCT FROM v_request THEN
   RAISE EXCEPTION 'Design idempotency collision' USING ERRCODE='23505';END IF;
  RETURN pg_catalog.jsonb_build_object('update_id',p_update_id,'idempotent',true);
 END IF;
 SELECT * INTO v_store FROM public.saas_storefronts
 WHERE id=p_storefront_id AND org_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Store outside tenant' USING ERRCODE='42501';END IF;
 UPDATE public.saas_storefronts SET seo_title=v_title,
 seo_description=v_description,banner_url=v_banner,
 accent_color=v_accent,updated_at=now()
 WHERE id=p_storefront_id AND org_id=v_org;
 INSERT INTO public.saas_storefront_design_receipts(
 id,org_id,storefront_id,request_body,created_by)
 VALUES(p_update_id,v_org,p_storefront_id,v_request,v_user);
 RETURN pg_catalog.jsonb_build_object('update_id',p_update_id,
 'storefront_id',p_storefront_id,'idempotent',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.saas_storefront_update_design_once(uuid,uuid,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_storefront_update_design_once(uuid,uuid,jsonb) TO authenticated;
