-- M17 additive shipping tariff groundwork. Quote only: no payment, checkout, or stock mutation.
-- Tenant managers configure rates; anonymous clients may obtain a quote for a published store.
CREATE TABLE IF NOT EXISTS public.saas_storefront_shipping_zones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 storefront_id uuid NOT NULL REFERENCES public.saas_storefronts(id),
 postal_prefix text NOT NULL CHECK (postal_prefix ~ '^[0-9]{2,6}$'),
 base_charge numeric(12,2) NOT NULL CHECK (base_charge>=0 AND base_charge<=10000),
 per_item_charge numeric(12,2) NOT NULL DEFAULT 0 CHECK (per_item_charge>=0 AND per_item_charge<=1000),
 cod_enabled boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true,
 UNIQUE(storefront_id,postal_prefix)
);
ALTER TABLE public.saas_storefront_shipping_zones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saas_storefront_shipping_zones FROM PUBLIC,anon,authenticated;
CREATE POLICY saas_shipping_tenant_read ON public.saas_storefront_shipping_zones
 FOR SELECT TO authenticated USING (EXISTS (
 SELECT 1 FROM public.organization_members m
 WHERE m.org_id=saas_storefront_shipping_zones.org_id AND m.user_id=(SELECT auth.uid())));
GRANT SELECT ON public.saas_storefront_shipping_zones TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_storefront_shipping_quote(
 p_slug text, p_postal_code text, p_item_count integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_store public.saas_storefronts%ROWTYPE;
 v_zone public.saas_storefront_shipping_zones%ROWTYPE;
 v_charge numeric(12,2);
BEGIN
 IF p_postal_code !~ '^[0-9]{6}$' OR p_item_count NOT BETWEEN 1 AND 100
 OR p_slug IS NULL THEN
  RAISE EXCEPTION 'Invalid delivery quote request' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_store FROM public.saas_storefronts
 WHERE slug=p_slug AND published=true;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Store unavailable' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_zone FROM public.saas_storefront_shipping_zones z
 WHERE z.storefront_id=v_store.id AND z.org_id=v_store.org_id AND z.active
 AND left(p_postal_code,length(z.postal_prefix))=z.postal_prefix
 ORDER BY length(z.postal_prefix) DESC LIMIT 1;
 IF NOT FOUND THEN
  RETURN pg_catalog.jsonb_build_object('serviceable',false,
   'cod_available',false,'prepayment_verified',false);
 END IF;
 v_charge:=v_zone.base_charge+v_zone.per_item_charge*p_item_count;
 RETURN pg_catalog.jsonb_build_object('serviceable',true,
  'shipping_charge',v_charge,'currency','INR',
  'cod_available',false,'cod_requested_supported',v_zone.cod_enabled,
  'prepayment_verified',false,'quote_only',true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.saas_storefront_shipping_quote(text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.saas_storefront_shipping_quote(text,text,integer) TO anon,authenticated;
