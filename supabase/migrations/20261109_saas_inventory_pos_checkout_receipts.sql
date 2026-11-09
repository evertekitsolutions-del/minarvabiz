-- M7, M9, M10: SaaS-only tenant-scoped inventory and POS receipts.
-- Reuse existing verified atomic adjust_stock() and create_sale() procedures.
-- All retries are compared to an immutable server-side request body.

CREATE TABLE IF NOT EXISTS public.saas_inventory_mutation_receipts (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  request_body jsonb NOT NULL,
  result_body jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saas_inventory_receipts_org_idx
  ON public.saas_inventory_mutation_receipts(org_id, created_at DESC);
ALTER TABLE public.saas_inventory_mutation_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_inventory_receipts_read ON public.saas_inventory_mutation_receipts
 FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.org_id = saas_inventory_mutation_receipts.org_id
    AND m.user_id = (SELECT auth.uid())
 ));
CREATE POLICY saas_inventory_receipts_create ON public.saas_inventory_mutation_receipts
 FOR INSERT TO authenticated WITH CHECK (
  created_by = (SELECT auth.uid()) AND public.user_has_org_role(
    org_id,ARRAY['super_admin','admin','manager'])
 );
REVOKE ALL ON public.saas_inventory_mutation_receipts FROM PUBLIC,anon;
GRANT SELECT,INSERT ON public.saas_inventory_mutation_receipts TO authenticated;

CREATE TABLE IF NOT EXISTS public.saas_checkout_receipts (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  sale_id uuid NOT NULL REFERENCES public.sales(id),
  sale_payload jsonb NOT NULL,
  payments_payload jsonb NOT NULL,
  result_body jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,sale_id)
);
CREATE INDEX IF NOT EXISTS saas_checkout_receipts_org_idx
 ON public.saas_checkout_receipts(org_id,created_at DESC);
ALTER TABLE public.saas_checkout_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_checkout_receipts_read ON public.saas_checkout_receipts
 FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.org_id = saas_checkout_receipts.org_id AND m.user_id = (SELECT auth.uid())
 ));
CREATE POLICY saas_checkout_receipts_create ON public.saas_checkout_receipts
 FOR INSERT TO authenticated WITH CHECK (
  created_by = (SELECT auth.uid()) AND public.user_has_org_role(
    org_id,ARRAY['super_admin','admin','manager','cashier'])
 );
REVOKE ALL ON public.saas_checkout_receipts FROM PUBLIC,anon;
GRANT SELECT,INSERT ON public.saas_checkout_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_adjust_stock_once(
 p_mutation_id uuid,p_product_id uuid,p_movement_type text,
 p_quantity numeric,p_expected_version integer,p_branch_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE v_user uuid := (SELECT auth.uid());
 v_org uuid; v_request jsonb; v_prior public.saas_inventory_mutation_receipts%ROWTYPE;
 v_result jsonb;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR p_mutation_id IS NULL OR p_product_id IS NULL
  OR NOT public.user_has_org_role(v_org,ARRAY['super_admin','admin','manager'])
  THEN RAISE EXCEPTION 'Inventory operator is not authorized' USING ERRCODE='42501';
 END IF;
 IF p_movement_type NOT IN ('stock_in','stock_out','adjustment')
 OR p_quantity IS NULL OR p_quantity=0 OR abs(p_quantity)>999999999
 OR p_expected_version IS NULL OR p_expected_version<1 THEN
  RAISE EXCEPTION 'Invalid stock adjustment input' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id=p_product_id
  AND p.org_id=v_org AND p.deleted_at IS NULL
  AND (p_branch_id IS NULL OR p.branch_id IS NOT DISTINCT FROM p_branch_id)) THEN
  RAISE EXCEPTION 'Product branch or tenant does not match' USING ERRCODE='42501';
 END IF;
 v_request := jsonb_build_object(
  'product_id',p_product_id,'type',p_movement_type,'quantity',p_quantity,
  'version',p_expected_version,'branch_id',p_branch_id);
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('inventory:'||v_org::text||':'||p_mutation_id::text,0));
 SELECT * INTO v_prior FROM public.saas_inventory_mutation_receipts
  WHERE id=p_mutation_id AND org_id=v_org;
 IF FOUND THEN
  IF v_prior.request_body IS DISTINCT FROM v_request THEN
   RAISE EXCEPTION 'Idempotency key reused with different inventory payload'
    USING ERRCODE='23505';
  END IF;
  RETURN v_prior.result_body || jsonb_build_object('idempotent',true);
 END IF;
 v_result := public.adjust_stock(
  p_product_id,p_movement_type,p_quantity,p_expected_version,
  'saas_inventory',p_mutation_id,'Cloud-confirmed inventory adjustment',
  p_branch_id,NULL);
 INSERT INTO public.saas_inventory_mutation_receipts(
  id,org_id,product_id,request_body,result_body,created_by)
 VALUES(p_mutation_id,v_org,p_product_id,v_request,v_result,v_user);
 RETURN v_result || jsonb_build_object('idempotent',false,'mutation_id',p_mutation_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.saas_gst_inclusive_price(
 p_product_id uuid, p_quantity numeric DEFAULT 1
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE v_org uuid; v_product public.products%ROWTYPE;
 v_gross numeric; v_net numeric; v_tax numeric;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > 999999 THEN
  RAISE EXCEPTION 'Invalid quantity' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_product FROM public.products WHERE id=p_product_id
  AND org_id=v_org AND deleted_at IS NULL AND is_active IS TRUE;
 IF NOT FOUND OR v_product.has_variants IS TRUE THEN
  RAISE EXCEPTION 'Saleable tenant product not found' USING ERRCODE='42501';
 END IF;
 v_tax:=coalesce(v_product.tax_rate,0);
 IF v_tax<0 OR v_tax>100 THEN RAISE EXCEPTION 'Invalid GST percentage'; END IF;
 v_gross:=round(v_product.selling_price*p_quantity,2);
 v_net:=round(v_gross*100/(100+v_tax),2);
 RETURN jsonb_build_object(
  'product_id',p_product_id,'quantity',p_quantity,
  'unit_price_gst_inclusive',v_product.selling_price,'gst_percent',v_tax,
  'total_gross',v_gross,'gst_component',v_gross-v_net,'total_net',v_net);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.saas_checkout_once(
 p_mutation_id uuid,p_sale jsonb,p_payments jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE v_user uuid := (SELECT auth.uid());v_org uuid;
 v_existing public.saas_checkout_receipts%ROWTYPE;
 v_item jsonb;v_result jsonb;v_sale_id uuid;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(
  v_org,ARRAY['super_admin','admin','manager','cashier']) THEN
   RAISE EXCEPTION 'POS operator not authorized' USING ERRCODE='42501';
 END IF;
 IF p_mutation_id IS NULL OR jsonb_typeof(p_sale)<>'object'
 OR jsonb_typeof(p_payments)<>'array'
 OR jsonb_array_length(p_payments)>20
 OR jsonb_typeof(p_sale->'items')<>'array'
 OR jsonb_array_length(p_sale->'items') NOT BETWEEN 1 AND 200
 OR NULLIF(p_sale->>'id','')::uuid IS DISTINCT FROM p_mutation_id THEN
   RAISE EXCEPTION 'Invalid stable POS checkout envelope' USING ERRCODE='22023';
 END IF;
 v_sale_id := p_mutation_id;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_sale->'items') LOOP
   IF (v_item->>'quantity')::numeric <=0
      OR (v_item->>'unit_price')::numeric <0
      OR NOT EXISTS (SELECT 1 FROM public.products p WHERE
        p.id=(v_item->>'product_id')::uuid AND p.org_id=v_org
        AND p.deleted_at IS NULL AND p.is_active IS TRUE
        AND coalesce(p.has_variants,false) IS FALSE) THEN
     RAISE EXCEPTION 'Invalid or non-saleable tenant POS product'
       USING ERRCODE='42501';
   END IF;
 END LOOP;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('checkout:'||v_org::text||':'||p_mutation_id::text,0));
 SELECT * INTO v_existing FROM public.saas_checkout_receipts
  WHERE id=p_mutation_id AND org_id=v_org;
 IF FOUND THEN
  IF v_existing.sale_payload IS DISTINCT FROM p_sale
     OR v_existing.payments_payload IS DISTINCT FROM p_payments THEN
    RAISE EXCEPTION 'Checkout ID reused with different sale/payment payload'
      USING ERRCODE='23505';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.sales s WHERE s.id=v_sale_id AND s.org_id=v_org) THEN
    RAISE EXCEPTION 'Checkout receipt missing durable sale' USING ERRCODE='23514';
  END IF;
  RETURN v_existing.result_body || jsonb_build_object('idempotent',true);
 END IF;
 v_result := public.create_sale(p_sale,p_payments,false);
 IF NOT EXISTS(SELECT 1 FROM public.sales s WHERE s.id=v_sale_id AND s.org_id=v_org) THEN
   RAISE EXCEPTION 'Atomic checkout did not create durable sale' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.saas_checkout_receipts(
  id,org_id,sale_id,sale_payload,payments_payload,result_body,created_by)
 VALUES(p_mutation_id,v_org,v_sale_id,p_sale,p_payments,v_result,v_user);
 RETURN v_result || jsonb_build_object('idempotent',false,'mutation_id',p_mutation_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.saas_adjust_stock_once(uuid,uuid,text,numeric,integer,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_adjust_stock_once(uuid,uuid,text,numeric,integer,uuid)
 TO authenticated;
REVOKE ALL ON FUNCTION public.saas_checkout_once(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_checkout_once(uuid,jsonb,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.saas_gst_inclusive_price(uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_gst_inclusive_price(uuid,numeric) TO authenticated;
