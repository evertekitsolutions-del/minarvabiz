-- M17 merchant order workflow: transactional reservation -> invoice/stock movement.
-- Payment is NEVER captured here. Confirmed orders create an unpaid customer invoice;
-- credit/online payments require a separate verified settlement integration.
ALTER TABLE public.saas_storefront_draft_orders
 DROP CONSTRAINT IF EXISTS saas_storefront_draft_orders_status_check;
ALTER TABLE public.saas_storefront_draft_orders
 ADD CONSTRAINT saas_storefront_draft_orders_status_check
 CHECK(status IN('pending_review','accepted','confirmed','packed','shipped','delivered','cancelled','expired'));

CREATE TABLE IF NOT EXISTS public.saas_storefront_order_events(
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 order_id uuid NOT NULL REFERENCES public.saas_storefront_draft_orders(id),
 from_status text NOT NULL,
 to_status text NOT NULL CHECK(to_status IN('confirmed','packed','shipped','delivered','cancelled','expired')),
 branch_id uuid REFERENCES public.branches(id),
 tracking_code text,
 request_body jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,to_status)
);
CREATE INDEX IF NOT EXISTS saas_storefront_order_events_org_idx
 ON public.saas_storefront_order_events(org_id,order_id,created_at);
CREATE TABLE IF NOT EXISTS public.saas_storefront_order_receipts(
 order_id uuid PRIMARY KEY REFERENCES public.saas_storefront_draft_orders(id),
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 sale_id uuid NOT NULL UNIQUE REFERENCES public.sales(id),
 customer_id uuid NOT NULL REFERENCES public.customers(id),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.saas_storefront_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_storefront_order_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_order_events_tenant_read ON public.saas_storefront_order_events
 FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.organization_members m
  WHERE m.org_id=saas_storefront_order_events.org_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY saas_order_receipts_tenant_read ON public.saas_storefront_order_receipts
 FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.organization_members m
  WHERE m.org_id=saas_storefront_order_receipts.org_id AND m.user_id=(SELECT auth.uid())));
REVOKE ALL ON public.saas_storefront_order_events,public.saas_storefront_order_receipts
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.saas_storefront_order_events,public.saas_storefront_order_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_storefront_order_transition_once(
 p_event_id uuid,p_order_id uuid,p_next_status text,
 p_branch_id uuid DEFAULT NULL,p_tracking_code text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_org uuid;v_user uuid:=(SELECT auth.uid());
 v_order public.saas_storefront_draft_orders%ROWTYPE;
 v_prior public.saas_storefront_order_events%ROWTYPE;
 v_item jsonb;
 v_product public.products%ROWTYPE;
 v_listing public.saas_storefront_listings%ROWTYPE;
 v_customer_id uuid;
 v_qty numeric;
 v_tax numeric(14,2):=0;
 v_net numeric(14,2);
 v_gross numeric(14,2):=0;
 v_items jsonb:='[]'::jsonb;
 v_reserved public.saas_storefront_stock_reservations%ROWTYPE;
 v_receipt public.saas_storefront_order_receipts%ROWTYPE;
 v_payload jsonb;
 v_prev text;
 v_tracking text:=pg_catalog.btrim(coalesce(p_tracking_code,''));
 v_sale jsonb;
 v_result jsonb;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(
  v_org,ARRAY['super_admin','admin','manager']) THEN
  RAISE EXCEPTION 'Store order administrator required' USING ERRCODE='42501';
 END IF;
 IF p_event_id IS NULL OR p_order_id IS NULL
 OR p_next_status NOT IN('confirmed','packed','shipped','delivered','cancelled','expired')
 OR length(v_tracking)>120
 OR (p_next_status='shipped' AND length(v_tracking)<3)
 OR (p_next_status<>'shipped' AND v_tracking<>'') THEN
  RAISE EXCEPTION 'Invalid order transition request' USING ERRCODE='22023';
 END IF;
 v_payload:=pg_catalog.jsonb_build_object('order_id',p_order_id,
  'next',p_next_status,'branch_id',p_branch_id,'tracking',v_tracking);
 SELECT * INTO v_order FROM public.saas_storefront_draft_orders
 WHERE id=p_order_id AND org_id=v_org FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Store order outside tenant' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_prior FROM public.saas_storefront_order_events WHERE id=p_event_id;
 IF FOUND THEN
  IF v_prior.org_id<>v_org OR v_prior.order_id<>p_order_id
   OR v_prior.request_body IS DISTINCT FROM v_payload THEN
   RAISE EXCEPTION 'Transition key reused with different payload' USING ERRCODE='23505';
  END IF;
  RETURN pg_catalog.jsonb_build_object('event_id',p_event_id,
   'order_id',p_order_id,'status',v_prior.to_status,
   'idempotent',true);
 END IF;
 v_prev:=v_order.status;
 IF (p_next_status='confirmed' AND v_prev<>'pending_review') OR
  (p_next_status='packed' AND v_prev<>'confirmed') OR
  (p_next_status='shipped' AND v_prev<>'packed') OR
  (p_next_status='delivered' AND v_prev<>'shipped') OR
  (p_next_status IN('cancelled','expired') AND v_prev<>'pending_review') THEN
  RAISE EXCEPTION 'Invalid order transition % -> %',v_prev,p_next_status
   USING ERRCODE='23514';
 END IF;
 IF p_next_status='confirmed' THEN
  IF p_branch_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.branches b
   WHERE b.id=p_branch_id AND b.org_id=v_org AND b.is_active IS TRUE
   AND b.deleted_at IS NULL) THEN
   RAISE EXCEPTION 'Confirmation requires an active tenant fulfillment branch'
    USING ERRCODE='42501';
  END IF;
  IF pg_catalog.jsonb_typeof(v_order.items)<>'array' OR
   pg_catalog.jsonb_array_length(v_order.items) NOT BETWEEN 1 AND 30 OR
   (SELECT count(*) FROM public.saas_storefront_stock_reservations r
    WHERE r.order_id=p_order_id AND r.org_id=v_org AND r.released_at IS NULL
    AND r.expires_at>pg_catalog.now())<>pg_catalog.jsonb_array_length(v_order.items) THEN
   RAISE EXCEPTION 'Checkout holds expired or incomplete; no invoice created'
    USING ERRCODE='40001';
  END IF;
  -- Lock products in deterministic order to avoid deadlocks on concurrent orders.
  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_order.items)
   ORDER BY value->>'product_id' LOOP
   v_qty:=(v_item->>'quantity')::numeric;
   SELECT * INTO v_reserved FROM public.saas_storefront_stock_reservations r
    WHERE r.order_id=p_order_id AND r.org_id=v_org
     AND r.product_id=(v_item->>'product_id')::uuid AND r.released_at IS NULL
     AND r.expires_at>pg_catalog.now() FOR UPDATE;
   IF NOT FOUND OR v_reserved.quantity<>v_qty THEN
    RAISE EXCEPTION 'Reservation quantity mismatch' USING ERRCODE='40001';END IF;
   SELECT * INTO v_product FROM public.products p
   WHERE p.id=v_reserved.product_id AND p.org_id=v_org
    AND p.is_active IS TRUE AND p.deleted_at IS NULL
    AND coalesce(p.has_variants,false) IS FALSE FOR UPDATE;
   IF NOT FOUND OR v_product.stock_quantity<v_qty OR
    (v_product.branch_id IS NOT NULL AND v_product.branch_id<>p_branch_id) THEN
    RAISE EXCEPTION 'Product missing, branch mismatch or insufficient stock'
     USING ERRCODE='40001';
   END IF;
   SELECT * INTO v_listing FROM public.saas_storefront_listings l
    WHERE l.product_id=v_product.id AND l.storefront_id=v_order.storefront_id
    AND l.org_id=v_org AND l.active IS TRUE;
   IF NOT FOUND OR v_listing.price IS DISTINCT FROM v_product.selling_price
    OR v_listing.price IS DISTINCT FROM (v_item->>'unit_price')::numeric
    OR (v_item->>'line_total')::numeric IS DISTINCT FROM
       round(v_listing.price*v_qty,2) THEN
    RAISE EXCEPTION 'Listed Price changed since checkout; manual review required'
     USING ERRCODE='40001';
   END IF;
   v_gross:=v_gross+round(v_listing.price*v_qty,2);
   v_net:=round(v_listing.price*v_qty*100/(100+coalesce(v_product.tax_rate,0)),2);
   v_tax:=v_tax+(round(v_listing.price*v_qty,2)-v_net);
   v_items:=v_items||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'id',pg_catalog.gen_random_uuid(),'product_id',v_product.id,
    'product_name',v_product.name,'sku',v_product.sku,'quantity',v_qty,
    'unit_price',v_listing.price,'cost_price',v_product.cost_price,
    'tax_rate',coalesce(v_product.tax_rate,0),'discount_percent',0,
    'line_total',round(v_listing.price*v_qty,2)));
  END LOOP;
  IF v_gross IS DISTINCT FROM v_order.total THEN
   RAISE EXCEPTION 'Order total differs from authoritative listed prices'
    USING ERRCODE='40001';
  END IF;
  SELECT c.id INTO v_customer_id FROM public.customers c
   WHERE c.org_id=v_org AND c.phone=v_order.buyer_phone AND c.deleted_at IS NULL
   ORDER BY c.created_at,c.id LIMIT 1 FOR UPDATE;
  IF v_customer_id IS NULL THEN
   v_customer_id:=pg_catalog.gen_random_uuid();
   INSERT INTO public.customers(id,org_id,branch_id,name,phone)
   VALUES(v_customer_id,v_org,p_branch_id,
    v_order.buyer_name,v_order.buyer_phone);
  END IF;
  -- Within the same transaction, release this order's hold and remove it from
  -- pending_review. Existing other guest holds remain protected by the POS guard.
  UPDATE public.saas_storefront_stock_reservations
   SET released_at=pg_catalog.now()
   WHERE order_id=p_order_id AND org_id=v_org AND released_at IS NULL;
  UPDATE public.saas_storefront_draft_orders SET status='confirmed'
   WHERE id=p_order_id AND org_id=v_org;
  v_sale:=pg_catalog.jsonb_build_object(
   'id',p_order_id,'invoice_number','WEB-'||p_order_id::text,
   'customer_id',v_customer_id,'customer_name',v_order.buyer_name,
   'branch_id',p_branch_id,'subtotal',v_gross-v_tax,
   'tax_amount',v_tax,'total',v_gross,
   'paid_amount',0,'balance_amount',v_gross,'status','completed',
   'notes','Unpaid online guest order '||p_order_id::text,
   'items',v_items);
  v_result:=public.create_sale(v_sale,'[]'::jsonb,false);
  IF v_result->>'sale_id' IS DISTINCT FROM p_order_id::text THEN
   RAISE EXCEPTION 'Store order invoice posting not confirmed'
    USING ERRCODE='40001';
  END IF;
  INSERT INTO public.saas_storefront_order_receipts(
   order_id,org_id,sale_id,customer_id,branch_id)
  VALUES(p_order_id,v_org,p_order_id,v_customer_id,p_branch_id);
 ELSE
  IF p_next_status IN('cancelled','expired') THEN
   UPDATE public.saas_storefront_stock_reservations
    SET released_at=coalesce(released_at,pg_catalog.now())
    WHERE order_id=p_order_id AND org_id=v_org AND released_at IS NULL;
  ELSIF NOT EXISTS(SELECT 1 FROM public.saas_storefront_order_receipts r
   WHERE r.order_id=p_order_id AND r.org_id=v_org) THEN
   RAISE EXCEPTION 'Cannot fulfill order without a durable unpaid invoice'
    USING ERRCODE='23514';
  END IF;
  UPDATE public.saas_storefront_draft_orders SET status=p_next_status
   WHERE id=p_order_id AND org_id=v_org;
 END IF;
 INSERT INTO public.saas_storefront_order_events(
  id,org_id,order_id,from_status,to_status,branch_id,tracking_code,
  request_body,created_by)
 VALUES(p_event_id,v_org,p_order_id,v_prev,p_next_status,
  CASE WHEN p_next_status='confirmed' THEN p_branch_id ELSE NULL END,
  nullif(v_tracking,''),v_payload,v_user);
 RETURN pg_catalog.jsonb_build_object('event_id',p_event_id,
  'order_id',p_order_id,'status',p_next_status,
  'invoice_id',CASE WHEN p_next_status='confirmed' THEN p_order_id ELSE NULL END,
  'idempotent',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.saas_storefront_order_transition_once(uuid,uuid,text,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_storefront_order_transition_once(uuid,uuid,text,uuid,text)
 TO authenticated;
