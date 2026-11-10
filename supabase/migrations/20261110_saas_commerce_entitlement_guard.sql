-- M21 enforce Ecommerce entitlements at PostgreSQL write boundaries.
-- Grandfather ONLY existing organizations at migration time; all new tenants
-- require a valid commerce plan/trial. No client can add legacy exemptions.
CREATE TABLE IF NOT EXISTS public.saas_precommercial_legacy_tenants(
 org_id uuid PRIMARY KEY REFERENCES public.organizations(id),
 grandfathered_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.saas_precommercial_legacy_tenants(org_id)
 SELECT id FROM public.organizations ON CONFLICT DO NOTHING;
ALTER TABLE public.saas_precommercial_legacy_tenants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saas_precommercial_legacy_tenants
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.saas_entitled_for_org_internal(
 p_org_id uuid,p_feature text
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_sub public.saas_tenant_subscriptions%ROWTYPE;v_features text[];
BEGIN
 SELECT * INTO v_sub FROM public.saas_tenant_subscriptions WHERE org_id=p_org_id;
 IF NOT FOUND THEN
  RETURN EXISTS(SELECT 1 FROM public.saas_precommercial_legacy_tenants
   WHERE org_id=p_org_id);
 END IF;
 SELECT entitlements INTO v_features FROM public.saas_annual_plans
 WHERE code=v_sub.plan_code;
 RETURN coalesce(p_feature=ANY(v_features),false) AND (
 (v_sub.state='trial' AND now()<v_sub.trial_ends_at) OR
 (v_sub.state='active' AND v_sub.paid_through>now()
  AND v_sub.payment_environment='live'));
END;$fn$;
REVOKE ALL ON FUNCTION public.saas_entitled_for_org_internal(uuid,text)
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.saas_guard_commerce_entitlement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_org uuid;
BEGIN
 v_org:=NEW.org_id;
 IF v_org IS NULL OR NOT public.saas_entitled_for_org_internal(v_org,'ecommerce') THEN
  RAISE EXCEPTION 'Online commerce requires an entitled Full E-Commerce subscription'
   USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION public.saas_guard_commerce_entitlement()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS saas_storefront_entitlement_trg ON public.saas_storefronts;
CREATE TRIGGER saas_storefront_entitlement_trg
 BEFORE INSERT OR UPDATE ON public.saas_storefronts
 FOR EACH ROW WHEN (NEW.published IS TRUE)
 EXECUTE FUNCTION public.saas_guard_commerce_entitlement();
DROP TRIGGER IF EXISTS saas_storefront_checkout_entitlement_trg ON public.saas_storefront_draft_orders;
CREATE TRIGGER saas_storefront_checkout_entitlement_trg
 BEFORE INSERT ON public.saas_storefront_draft_orders
 FOR EACH ROW EXECUTE FUNCTION public.saas_guard_commerce_entitlement();
DROP TRIGGER IF EXISTS saas_storefront_listings_entitlement_trg ON public.saas_storefront_listings;
CREATE TRIGGER saas_storefront_listings_entitlement_trg
 BEFORE INSERT OR UPDATE ON public.saas_storefront_listings
 FOR EACH ROW EXECUTE FUNCTION public.saas_guard_commerce_entitlement();
