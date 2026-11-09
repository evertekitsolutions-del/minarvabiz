-- M9/M10 follow-on: server-authoritative GST inclusive unit prices / stock.
-- Initial cloud checkout supports unpaid credit receipts ONLY. Never pass
-- client supplied card/online payment events to a live financial ledger.
CREATE OR REPLACE FUNCTION public.saas_checkout_once(
 p_mutation_id uuid,p_sale jsonb,p_payments jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_user uuid := (SELECT auth.uid());
 v_org uuid;
 v_existing public.saas_checkout_receipts%ROWTYPE;
 v_item jsonb;
 v_product public.products%ROWTYPE;
 v_result jsonb;
 v_sale_id uuid;
 v_quantity numeric;
 v_gross numeric:=0;
 v_net numeric:=0;
 v_tax numeric:=0;
 v_line numeric;
 v_line_net numeric;
 v_tax_rate numeric;
 v_items_count integer;
 v_sale_count integer;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(
  v_org,ARRAY['super_admin','admin','manager','cashier']
 ) THEN RAISE EXCEPTION 'POS operator not authorized' USING ERRCODE='42501'; END IF;
 IF p_mutation_id IS NULL
  OR jsonb_typeof(p_sale) IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_payments) IS DISTINCT FROM 'array'
  OR p_payments IS DISTINCT FROM '[]'::jsonb
  OR jsonb_typeof(p_sale->'items') IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_sale->'items') NOT BETWEEN 1 AND 200
  OR NULLIF(p_sale->>'id','')::uuid IS DISTINCT FROM p_mutation_id
  OR nullif(btrim(p_sale->>'invoice_number'),'') IS NULL
  OR p_sale->>'status' IS DISTINCT FROM 'completed'
  OR COALESCE(NULLIF(p_sale->>'paid_amount','')::numeric,-1) <> 0
  OR COALESCE(NULLIF(p_sale->>'discount_amount','')::numeric,-1) <> 0
  OR NULLIF(p_sale->>'customer_id','') IS NOT NULL
  OR NULLIF(p_sale->>'branch_id','') IS NOT NULL
  THEN RAISE EXCEPTION 'Only validated unpaid, undiscounted cloud POS receipts are allowed'
    USING ERRCODE='22023';
 END IF;
 v_sale_id:=p_mutation_id;
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
  SELECT count(*) INTO v_sale_count FROM public.sales s
   WHERE s.id=v_sale_id AND s.org_id=v_org;
  IF v_sale_count<>1 THEN
   RAISE EXCEPTION 'Checkout receipt missing durable sale' USING ERRCODE='23514';
  END IF;
  RETURN v_existing.result_body || jsonb_build_object('idempotent',true);
 END IF;
 IF EXISTS(SELECT 1 FROM public.sales s WHERE s.id=v_sale_id AND s.org_id=v_org) THEN
  RAISE EXCEPTION 'Existing sale ID has no validated checkout receipt' USING ERRCODE='23505';
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_sale->'items') LOOP
  IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
   OR NULLIF(v_item->>'id','') IS NULL
   OR NULLIF(v_item->>'product_id','') IS NULL
   THEN RAISE EXCEPTION 'Malformed POS item' USING ERRCODE='22023'; END IF;
  v_quantity:=(v_item->>'quantity')::numeric;
  IF v_quantity IS NULL OR v_quantity <=0 OR v_quantity > 999999
   OR round(v_quantity,3)<>v_quantity THEN
   RAISE EXCEPTION 'Invalid POS quantity' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_product FROM public.products p
  WHERE p.id=(v_item->>'product_id')::uuid AND p.org_id=v_org
   AND p.deleted_at IS NULL AND p.is_active IS TRUE
   AND coalesce(p.has_variants,false) IS FALSE
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saleable tenant product not found'
    USING ERRCODE='42501'; END IF;
  v_tax_rate:=coalesce(v_product.tax_rate,0);
  IF v_tax_rate NOT BETWEEN 0 AND 100 THEN
   RAISE EXCEPTION 'Invalid catalog GST rate' USING ERRCODE='22023';
  END IF;
  v_line:=round(v_product.selling_price*v_quantity,2);
  v_line_net:=round(v_line*100/(100+v_tax_rate),2);
  IF (v_item->>'unit_price')::numeric IS DISTINCT FROM v_product.selling_price
   OR (v_item->>'cost_price')::numeric IS DISTINCT FROM v_product.cost_price
   OR coalesce((v_item->>'tax_rate')::numeric,0) IS DISTINCT FROM v_tax_rate
   OR (v_item->>'line_total')::numeric IS DISTINCT FROM v_line
   OR coalesce((v_item->>'discount_percent')::numeric,0)<>0
   OR nullif(v_item->>'product_name','') IS DISTINCT FROM v_product.name
   OR nullif(v_item->>'sku','') IS DISTINCT FROM v_product.sku THEN
   RAISE EXCEPTION 'Client POS amount differs from authoritative catalog'
    USING ERRCODE='23514';
  END IF;
  v_gross:=v_gross+v_line;
  v_net:=v_net+v_line_net;
  v_tax:=v_tax+(v_line-v_line_net);
 END LOOP;
 IF (p_sale->>'total')::numeric IS DISTINCT FROM v_gross
  OR (p_sale->>'subtotal')::numeric IS DISTINCT FROM v_net
  OR (p_sale->>'tax_amount')::numeric IS DISTINCT FROM v_tax
  OR (p_sale->>'balance_amount')::numeric IS DISTINCT FROM v_gross THEN
  RAISE EXCEPTION 'POS GST-inclusive totals do not reconcile'
   USING ERRCODE='23514';
 END IF;
 v_result:=public.create_sale(p_sale,'[]'::jsonb,false);
 SELECT count(*) INTO v_sale_count FROM public.sales s
  WHERE s.id=v_sale_id AND s.org_id=v_org AND s.total=v_gross AND s.paid_amount=0;
 IF v_sale_count<>1 THEN
  RAISE EXCEPTION 'Atomic checkout not durable or settlement mismatch'
   USING ERRCODE='23514';
 END IF;
 INSERT INTO public.saas_checkout_receipts(
  id,org_id,sale_id,sale_payload,payments_payload,result_body,created_by
 ) VALUES(p_mutation_id,v_org,v_sale_id,p_sale,'[]'::jsonb,v_result,v_user);
 RETURN v_result || jsonb_build_object(
  'idempotent',false,'mutation_id',p_mutation_id,'verified_total',v_gross);
END;
$fn$;
REVOKE ALL ON FUNCTION public.saas_checkout_once(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_checkout_once(uuid,jsonb,jsonb) TO authenticated;
