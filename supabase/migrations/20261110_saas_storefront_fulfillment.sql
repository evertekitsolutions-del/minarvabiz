-- M17: merchant-authenticated order confirmation, durable invoice/stock consumption,
-- idempotent packing/shipping/delivery; cancellation or expiry releases guest holds.
-- Never charge a gateway or create payments without verified payment receipt.
CREATE TABLE IF NOT EXISTS public.saas_storefront_fulfillment_events(
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 storefront_id uuid NOT NULL REFERENCES public.saas_storefronts(id),
 order_id uuid NOT NULL REFERENCES public.saas_storefront_draft_orders(id),
 previous_status text NOT NULL,
 new_status text NOT NULL,
 tracking_ref text,
 sale_id uuid REFERENCES public.sales(id),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX IF NOT EXISTS saas_storefront_fulfillment_events_org_idx
 ON public.saas_storefront_fulfillment_events(org_id,order_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS saas_storefront_one_confirmed_invoice
 ON public.saas_storefront_fulfillment_events(order_id)
 WHERE new_status='confirmed';
ALTER TABLE public.saas_storefront_fulfillment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_storefront_fulfillment_events_tenant_read
 ON public.saas_storefront_fulfillment_events FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.organization_members m
 WHERE m.org_id=saas_storefront_fulfillment_events.org_id AND m.user_id=(SELECT auth.uid())));
REVOKE ALL ON public.saas_storefront_fulfillment_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.saas_storefront_fulfillment_events TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_online_order_transition(
 p_event_id uuid,p_order_id uuid,p_target_status text,
 p_branch_id uuid,p_tracking_ref text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_org uuid;v_user uuid:=(SELECT auth.uid());
 v_order public.saas_storefront_draft_orders%ROWTYPE;
 v_prior public.saas_storefront_fulfillment_events%ROWTYPE;
 v_store public.saas_storefronts%ROWTYPE;
 v_item jsonb;v_product public.products%ROWTYPE;
 v_expected bigint;v_actual bigint;v_qty numeric;
 v_other_held numeric;v_branch_qty numeric;
 v_tax numeric(14,2):=0;v_lines jsonb:='[]'::jsonb;
 v_sale_id uuid;v_invoice text;v_tracking text:=pg_catalog.btrim(coalesce(p_tracking_ref,''));
 v_prev text;v_result jsonb;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL
 OR NOT public.user_has_org_role(v_org,ARRAY['super_admin','admin','manager'])
 THEN RAISE EXCEPTION 'Order fulfillment admin required' USING ERRCODE='42501'; END IF;
 IF p_event_id IS NULL OR p_order_id IS NULL OR p_branch_id IS NULL
 OR p_target_status NOT IN('confirmed','packed','shipped','delivered','cancelled','expired')
 OR length(v_tracking)>100
 OR (p_target_status='shipped' AND length(v_tracking)<4) THEN
  RAISE EXCEPTION 'Invalid online order status request' USING ERRCODE='22023';
 END IF;
 -- Serialize actions and provide exact same-key durable idempotency.
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('saas-order-state:'||p_order_id::text,0));
 SELECT * INTO v_prior FROM public.saas_storefront_fulfillment_events WHERE id=p_event_id;
 IF FOUND THEN
  IF v_prior.org_id<>v_org OR v_prior.order_id<>p_order_id OR
   v_prior.new_status<>p_target_status OR
   v_prior.tracking_ref IS DISTINCT FROM nullif(v_tracking,'') THEN
    RAISE EXCEPTION 'Order status event ID payload collision' USING ERRCODE='23505';
  END IF;
  RETURN pg_catalog.jsonb_build_object('event_id',p_event_id,'order_id',p_order_id,
   'status',v_prior.new_status,'sale_id',v_prior.sale_id,'idempotent',true);
 END IF;
 SELECT * INTO v_order FROM public.saas_storefront_draft_orders
 WHERE id=p_order_id AND org_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Online order outside authorized tenant' USING ERRCODE='42501';END IF;
 SELECT * INTO v_store FROM public.saas_storefronts
 WHERE id=v_order.storefront_id AND org_id=v_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Storefront missing from tenant' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=p_branch_id
  AND b.org_id=v_org AND b.is_active IS TRUE AND b.deleted_at IS NULL) THEN
  RAISE EXCEPTION 'Fulfillment branch outside tenant' USING ERRCODE='42501';END IF;
 v_prev:=v_order.status;
 IF NOT (
  (v_prev='pending_review' AND p_target_status IN('confirmed','cancelled','expired'))
  OR (v_prev='confirmed' AND p_target_status='packed')
  OR (v_prev='packed' AND p_target_status='shipped')
  OR (v_prev='shipped' AND p_target_status='delivered')
 ) THEN
  RAISE EXCEPTION 'Illegal online order status transition % -> %',v_prev,p_target_status
  USING ERRCODE='23514';
 END IF;
 IF p_target_status='confirmed' THEN
  v_expected:=pg_catalog.jsonb_array_length(v_order.items);
  SELECT count(*) INTO v_actual
   FROM public.saas_storefront_stock_reservations r
   WHERE r.order_id=v_order.id AND r.org_id=v_org
   AND r.storefront_id=v_store.id AND r.released_at IS NULL
   AND r.expires_at>pg_catalog.now();
  IF v_expected<>v_actual OR v_expected<1 THEN
   RAISE EXCEPTION 'Checkout reservation missing or expired; buyer must reorder'
   USING ERRCODE='40001';
  END IF;
  -- Lock child SKUs in deterministic order while reservation is still held.
  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_order.items) AS x(value)
    ORDER BY value->>'product_id' LOOP
   v_qty:=(v_item->>'quantity')::numeric;
   SELECT * INTO v_product FROM public.products p
    WHERE p.id=(v_item->>'product_id')::uuid
    AND p.org_id=v_org AND p.deleted_at IS NULL AND p.is_active IS TRUE
    AND coalesce(p.has_variants,false) IS FALSE FOR UPDATE;
   IF NOT FOUND OR v_product.stock_quantity<v_qty OR
    v_product.selling_price IS DISTINCT FROM (v_item->>'unit_price')::numeric THEN
    RAISE EXCEPTION 'Confirmed item unavailable or price changed' USING ERRCODE='40001';
   END IF;
   IF v_product.branch_id IS NOT NULL AND v_product.branch_id<>p_branch_id THEN
    RAISE EXCEPTION 'Product is assigned to another fulfillment branch'
     USING ERRCODE='42501';
   END IF;
   IF EXISTS(SELECT 1 FROM public.saas_branch_stock_seeds s
    WHERE s.org_id=v_org AND s.product_id=v_product.id) THEN
    SELECT quantity INTO v_branch_qty FROM public.saas_branch_stock s
    WHERE s.org_id=v_org AND s.product_id=v_product.id
      AND s.branch_id=p_branch_id;
    IF coalesce(v_branch_qty,0)<v_qty THEN
     RAISE EXCEPTION 'Reserved product not available at fulfillment branch'
      USING ERRCODE='23514';
    END IF;
   END IF;
   SELECT coalesce(sum(r.quantity),0) INTO v_other_held
    FROM public.saas_storefront_stock_reservations r
    JOIN public.saas_storefront_draft_orders o ON o.id=r.order_id AND o.org_id=r.org_id
    WHERE r.org_id=v_org AND r.product_id=v_product.id
     AND r.order_id<>v_order.id AND o.status='pending_review'
     AND r.released_at IS NULL AND r.expires_at>pg_catalog.now();
   IF v_product.stock_quantity-v_other_held<v_qty THEN
    RAISE EXCEPTION 'Other guest reservations must remain honored' USING ERRCODE='40001';
   END IF;
   IF NOT EXISTS(SELECT 1 FROM public.saas_storefront_stock_reservations r
    WHERE r.org_id=v_org AND r.order_id=v_order.id
    AND r.product_id=v_product.id AND r.quantity=v_qty
    AND r.expires_at>pg_catalog.now() AND r.released_at IS NULL) THEN
    RAISE EXCEPTION 'Order reservation quantity mismatch' USING ERRCODE='40001';
   END IF;
   v_tax:=v_tax+round(((v_item->>'line_total')::numeric *
    coalesce(v_product.tax_rate,0)/(100+coalesce(v_product.tax_rate,0))),2);
   v_lines:=v_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'id',pg_catalog.gen_random_uuid(),'product_id',v_product.id,
    'product_name',v_item->>'name','sku',v_product.sku,
    'quantity',v_qty,'unit_price',(v_item->>'unit_price')::numeric,
    'cost_price',v_product.cost_price,'tax_rate',v_product.tax_rate,
    'line_total',(v_item->>'line_total')::numeric));
  END LOOP;
  -- The existing create_sale() posts immutable sale_items + stock ledger movement
  -- in the SAME SQL transaction. Release only our own reservations immediately
  -- before calling it; a rollback re-holds every guest reservation atomically.
  UPDATE public.saas_storefront_stock_reservations SET released_at=pg_catalog.now()
   WHERE org_id=v_org AND order_id=v_order.id AND released_at IS NULL;
  v_sale_id:=v_order.id;
  v_invoice:='WEB-'||v_order.id::text;
  IF EXISTS(SELECT 1 FROM public.sales s WHERE s.id=v_sale_id OR s.invoice_number=v_invoice)
  THEN RAISE EXCEPTION 'Online invoice ID already present' USING ERRCODE='23505'; END IF;
  v_result:=public.create_sale(pg_catalog.jsonb_build_object(
   'id',v_sale_id,'invoice_number',v_invoice,'customer_name',v_order.buyer_name,
   'branch_id',p_branch_id,'subtotal',v_order.total-v_tax,'tax_amount',v_tax,
   'total',v_order.total,'paid_amount',0,'balance_amount',v_order.total,
   'status','completed','notes','Unpaid guest storefront order '||v_order.id::text,
   'items',v_lines),'[]'::jsonb,false);
  IF v_result->>'sale_id' IS DISTINCT FROM v_sale_id::text
    OR (v_result->>'idempotent')::boolean IS TRUE THEN
    RAISE EXCEPTION 'New online sale posting not confirmed' USING ERRCODE='40001';
  END IF;
 ELSIF p_target_status='expired' THEN
  IF EXISTS(SELECT 1 FROM public.saas_storefront_stock_reservations
   WHERE order_id=v_order.id AND org_id=v_org AND expires_at>pg_catalog.now()
    AND released_at IS NULL) THEN
   RAISE EXCEPTION 'Reservation has not expired' USING ERRCODE='23514';
  END IF;
  UPDATE public.saas_storefront_stock_reservations SET released_at=pg_catalog.now()
   WHERE order_id=v_order.id AND org_id=v_org AND released_at IS NULL;
 ELSIF p_target_status='cancelled' THEN
  UPDATE public.saas_storefront_stock_reservations SET released_at=pg_catalog.now()
   WHERE order_id=v_order.id AND org_id=v_org AND released_at IS NULL;
 ELSE
  SELECT sale_id INTO v_sale_id FROM public.saas_storefront_fulfillment_events
  WHERE org_id=v_org AND order_id=v_order.id AND new_status='confirmed';
  IF v_sale_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.sales s
    WHERE s.id=v_sale_id AND s.org_id=v_org) THEN
   RAISE EXCEPTION 'Confirmed unpaid invoice not found' USING ERRCODE='40001';
  END IF;
 END IF;
 UPDATE public.saas_storefront_draft_orders SET status=p_target_status
  WHERE id=v_order.id AND org_id=v_org;
 INSERT INTO public.saas_storefront_fulfillment_events(
  id,org_id,storefront_id,order_id,previous_status,new_status,
  tracking_ref,sale_id,created_by)
 VALUES(p_event_id,v_org,v_store.id,v_order.id,v_prev,p_target_status,
  nullif(v_tracking,''),v_sale_id,v_user);
 RETURN pg_catalog.jsonb_build_object('event_id',p_event_id,'order_id',p_order_id,
  'status',p_target_status,'sale_id',v_sale_id,'idempotent',false,
  'payment_state','unpaid');
END;$fn$;
REVOKE ALL ON FUNCTION public.saas_online_order_transition(uuid,uuid,text,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_online_order_transition(uuid,uuid,text,uuid,text)
 TO authenticated;
-- Disable old guest draft-only endpoint: public buyer MUST hold stock first.
REVOKE EXECUTE ON FUNCTION public.saas_storefront_place_order(uuid,text,text,text,jsonb)
 FROM PUBLIC,anon,authenticated;
