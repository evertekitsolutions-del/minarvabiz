-- M17: 15-minute atomic guest checkout stock reservations, no payment capture.
-- Old draft-order API intentionally retained for older clients; new UI uses reservation RPC.
CREATE TABLE IF NOT EXISTS public.saas_storefront_stock_reservations(
 order_id uuid NOT NULL REFERENCES public.saas_storefront_draft_orders(id),
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 storefront_id uuid NOT NULL REFERENCES public.saas_storefronts(id),
 product_id uuid NOT NULL REFERENCES public.products(id),
 quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 released_at timestamptz,
 PRIMARY KEY(order_id,product_id),
 CHECK(expires_at>created_at)
);
CREATE INDEX IF NOT EXISTS saas_storefront_reservations_available
 ON public.saas_storefront_stock_reservations(org_id,product_id,expires_at DESC)
 WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS saas_storefront_reservations_store
 ON public.saas_storefront_stock_reservations(storefront_id,expires_at DESC)
 WHERE released_at IS NULL;
ALTER TABLE public.saas_storefront_stock_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_storefront_reservations_tenant_read
 ON public.saas_storefront_stock_reservations FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.organization_members m
 WHERE m.org_id=saas_storefront_stock_reservations.org_id AND m.user_id=(SELECT auth.uid())));
REVOKE ALL ON public.saas_storefront_stock_reservations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.saas_storefront_stock_reservations TO authenticated;

-- Prevent an existing POS/GRN/stock adjustment from silently overselling a held quantity.
-- No table-wide writes or customer data mutation in this trigger.
CREATE OR REPLACE FUNCTION public.saas_guard_active_online_reservations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_held numeric;
BEGIN
 IF NEW.stock_quantity IS NOT DISTINCT FROM OLD.stock_quantity THEN
  RETURN NEW;
 END IF;
 SELECT COALESCE(sum(r.quantity),0) INTO v_held
 FROM public.saas_storefront_stock_reservations r
 JOIN public.saas_storefront_draft_orders o
  ON o.id=r.order_id AND o.org_id=r.org_id AND o.status='pending_review'
 WHERE r.org_id=OLD.org_id AND r.product_id=OLD.id
  AND r.released_at IS NULL AND r.expires_at>pg_catalog.now();
 IF NEW.stock_quantity<v_held THEN
  RAISE EXCEPTION 'Available inventory is held for online guest checkout'
   USING ERRCODE='40001';
 END IF;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.saas_guard_active_online_reservations() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS saas_guard_active_online_reservations_trg ON public.products;
CREATE TRIGGER saas_guard_active_online_reservations_trg
 BEFORE UPDATE OF stock_quantity ON public.products
 FOR EACH ROW EXECUTE FUNCTION public.saas_guard_active_online_reservations();

CREATE OR REPLACE FUNCTION public.saas_storefront_checkout_reserved(
 p_order_id uuid,p_slug text,p_buyer_name text,p_buyer_phone text,p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_base jsonb;
 v_store public.saas_storefronts%ROWTYPE;
 v_order public.saas_storefront_draft_orders%ROWTYPE;
 v_row public.saas_storefront_stock_reservations%ROWTYPE;
 v_item jsonb;
 v_product public.products%ROWTYPE;
 v_qty numeric;
 v_held numeric;
 v_active bigint;
 v_existing bigint;
 v_expires timestamptz:=pg_catalog.now()+interval '15 minutes';
BEGIN
 -- Calling the existing draft RPC in the same PostgreSQL statement means failures
 -- below also roll back the guest draft. Existing idempotency is preserved.
 v_base:=public.saas_storefront_place_order(
  p_order_id,p_slug,p_buyer_name,p_buyer_phone,p_items);
 SELECT * INTO v_store FROM public.saas_storefronts
 WHERE slug=p_slug AND published=true;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Public storefront not found' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('saas-store-reservations:'||v_store.id::text,0));
 SELECT * INTO v_order FROM public.saas_storefront_draft_orders
 WHERE id=p_order_id AND org_id=v_store.org_id AND storefront_id=v_store.id;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Checkout draft receipt missing' USING ERRCODE='40001';
 END IF;
 IF v_order.status<>'pending_review' THEN
  RAISE EXCEPTION 'Only pending ERP draft orders may reserve stock'
   USING ERRCODE='42501';
 END IF;
 SELECT count(*),max(expires_at) INTO v_existing,v_expires
 FROM public.saas_storefront_stock_reservations WHERE order_id=p_order_id
   AND org_id=v_store.org_id;
 IF v_existing>0 THEN
  IF v_existing<>(SELECT jsonb_array_length(v_order.items)) THEN
   RAISE EXCEPTION 'Partial reservation receipt is inconsistent' USING ERRCODE='40001';
  END IF;
  RETURN v_base||pg_catalog.jsonb_build_object(
   'reservation_status',CASE WHEN v_expires>pg_catalog.now() THEN 'held' ELSE 'expired' END,
   'reservation_expires_at',v_expires,'idempotent',true);
 END IF;
 SELECT count(DISTINCT r.order_id) INTO v_active
 FROM public.saas_storefront_stock_reservations r
 JOIN public.saas_storefront_draft_orders o
 ON o.id=r.order_id AND o.org_id=r.org_id AND o.status='pending_review'
 WHERE r.storefront_id=v_store.id AND r.released_at IS NULL
  AND r.expires_at>pg_catalog.now();
 IF v_active>=25 THEN
  RAISE EXCEPTION 'Online reservations are temporarily at capacity'
   USING ERRCODE='42901';
 END IF;
 -- Sorted product locks avoid deadlocks in concurrent guest carts.
 FOR v_item IN SELECT value FROM jsonb_array_elements(v_order.items) AS x(value)
  ORDER BY value->>'product_id'
 LOOP
  v_qty:=(v_item->>'quantity')::numeric;
  IF v_qty<=0 OR v_qty>20 OR round(v_qty,3)<>v_qty THEN
   RAISE EXCEPTION 'Invalid reserved quantity' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_product FROM public.products p
  WHERE p.id=(v_item->>'product_id')::uuid AND p.org_id=v_store.org_id
   AND p.deleted_at IS NULL AND p.is_active IS TRUE
   AND coalesce(p.has_variants,false) IS FALSE FOR UPDATE;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'Public cart product is no longer saleable' USING ERRCODE='40001';
  END IF;
  SELECT COALESCE(sum(r.quantity),0) INTO v_held
  FROM public.saas_storefront_stock_reservations r
  JOIN public.saas_storefront_draft_orders o
   ON o.id=r.order_id AND o.org_id=r.org_id AND o.status='pending_review'
  WHERE r.org_id=v_store.org_id AND r.product_id=v_product.id
   AND r.released_at IS NULL AND r.expires_at>pg_catalog.now();
  IF v_product.stock_quantity-v_held<v_qty THEN
   RAISE EXCEPTION 'Product stock reserved by another online checkout'
    USING ERRCODE='40001';
  END IF;
  INSERT INTO public.saas_storefront_stock_reservations(
   order_id,org_id,storefront_id,product_id,quantity,expires_at)
  VALUES(p_order_id,v_store.org_id,v_store.id,v_product.id,v_qty,v_expires);
 END LOOP;
 RETURN v_base||pg_catalog.jsonb_build_object('reservation_status','held',
   'reservation_expires_at',v_expires,'idempotent',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.saas_storefront_checkout_reserved(uuid,text,text,text,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_storefront_checkout_reserved(uuid,text,text,text,jsonb)
 TO anon,authenticated;
