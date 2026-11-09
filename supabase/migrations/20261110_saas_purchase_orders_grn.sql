-- M8: online-only supplier PO -> transactional GRN -> payable.
-- Isolated additive tables; no paid gateway, legacy/offline writes, or data deletion.
CREATE TABLE IF NOT EXISTS public.saas_purchase_orders(
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  items_payload jsonb NOT NULL,
  total numeric(14,2) NOT NULL CHECK (total>=0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','received')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz
);
CREATE INDEX IF NOT EXISTS saas_po_tenant_supplier ON public.saas_purchase_orders(org_id,supplier_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.saas_purchase_order_items(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.saas_purchase_orders(id),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric(14,3) NOT NULL CHECK (quantity>0),
  unit_cost numeric(14,2) NOT NULL CHECK (unit_cost>=0),
  line_total numeric(14,2) NOT NULL CHECK (line_total>=0),
  UNIQUE(order_id,product_id)
);
CREATE TABLE IF NOT EXISTS public.saas_goods_receipts(
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL UNIQUE REFERENCES public.saas_purchase_orders(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.saas_supplier_payables(
  order_id uuid PRIMARY KEY REFERENCES public.saas_purchase_orders(id),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  total numeric(14,2) NOT NULL CHECK (total>=0),
  paid numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid>=0 AND paid<=total),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.saas_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_supplier_payables ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_po_member_read ON public.saas_purchase_orders FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.organization_members m WHERE m.org_id=saas_purchase_orders.org_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY saas_po_items_member_read ON public.saas_purchase_order_items FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.organization_members m WHERE m.org_id=saas_purchase_order_items.org_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY saas_grn_member_read ON public.saas_goods_receipts FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.organization_members m WHERE m.org_id=saas_goods_receipts.org_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY saas_payables_member_read ON public.saas_supplier_payables FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.organization_members m WHERE m.org_id=saas_supplier_payables.org_id AND m.user_id=(SELECT auth.uid())));
REVOKE ALL ON public.saas_purchase_orders,public.saas_purchase_order_items,public.saas_goods_receipts,public.saas_supplier_payables FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.saas_purchase_orders,public.saas_purchase_order_items,public.saas_goods_receipts,public.saas_supplier_payables TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_create_purchase_order(
 p_order_id uuid,p_supplier_id uuid,p_branch_id uuid,p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_user uuid := (SELECT auth.uid());
 v_po public.saas_purchase_orders%ROWTYPE;
 v_product public.products%ROWTYPE;
 v_item jsonb;v_quantity numeric;v_cost numeric;
 v_total numeric(14,2):=0;v_count int;v_existing int;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(v_org,
  ARRAY['super_admin','admin','manager']) THEN
  RAISE EXCEPTION 'Purchase administrator required' USING ERRCODE='42501';
 END IF;
 IF p_order_id IS NULL OR p_supplier_id IS NULL OR p_branch_id IS NULL
  OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'Invalid purchase order' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=p_supplier_id AND s.org_id=v_org)
  OR NOT EXISTS(SELECT 1 FROM public.branches b
    WHERE b.id=p_branch_id AND b.org_id=v_org AND b.deleted_at IS NULL) THEN
   RAISE EXCEPTION 'Supplier/branch outside authorized tenant' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('po:'||v_org::text||':'||p_order_id::text,0));
 SELECT * INTO v_po FROM public.saas_purchase_orders
  WHERE id=p_order_id AND org_id=v_org;
 IF FOUND THEN
  IF v_po.items_payload IS DISTINCT FROM p_items
    OR v_po.supplier_id IS DISTINCT FROM p_supplier_id
    OR v_po.branch_id IS DISTINCT FROM p_branch_id THEN
   RAISE EXCEPTION 'Purchase order ID payload conflict' USING ERRCODE='23505';
  END IF;
  RETURN jsonb_build_object('order_id',p_order_id,'total',v_po.total,'status',v_po.status,'idempotent',true);
 END IF;
 SELECT count(DISTINCT value->>'product_id') INTO v_count
 FROM jsonb_array_elements(p_items);
 IF v_count<>jsonb_array_length(p_items) THEN
  RAISE EXCEPTION 'Repeated product in same PO' USING ERRCODE='22023';
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF nullif(v_item->>'product_id','') IS NULL OR
   nullif(v_item->>'quantity','') IS NULL OR
   nullif(v_item->>'unit_cost','') IS NULL THEN
   RAISE EXCEPTION 'Malformed PO line' USING ERRCODE='22023';END IF;
  v_quantity:=(v_item->>'quantity')::numeric;
  v_cost:=(v_item->>'unit_cost')::numeric;
  IF v_quantity <=0 OR v_quantity>999999 OR round(v_quantity,3)<>v_quantity
   OR v_cost<0 OR v_cost>999999999 OR round(v_cost,2)<>v_cost THEN
   RAISE EXCEPTION 'Invalid PO unit or quantity' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_product FROM public.products p WHERE
   p.id=(v_item->>'product_id')::uuid AND p.org_id=v_org
   AND p.deleted_at IS NULL AND coalesce(p.has_variants,false)=false
   AND (p.branch_id IS NULL OR p.branch_id=p_branch_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'PO product outside tenant/branch or not saleable'
    USING ERRCODE='42501';END IF;
  v_total:=v_total+round(v_quantity*v_cost,2);
 END LOOP;
 INSERT INTO public.saas_purchase_orders(
  id,org_id,branch_id,supplier_id,items_payload,total,created_by)
 VALUES(p_order_id,v_org,p_branch_id,p_supplier_id,p_items,v_total,v_user);
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  v_quantity:=(v_item->>'quantity')::numeric;v_cost:=(v_item->>'unit_cost')::numeric;
  INSERT INTO public.saas_purchase_order_items(
   order_id,org_id,product_id,quantity,unit_cost,line_total)
  VALUES(p_order_id,v_org,(v_item->>'product_id')::uuid,v_quantity,v_cost,round(v_quantity*v_cost,2));
 END LOOP;
 RETURN jsonb_build_object('order_id',p_order_id,'total',v_total,'status','draft','idempotent',false);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.saas_receive_purchase_order(
 p_receipt_id uuid,p_order_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_user uuid := (SELECT auth.uid());
 v_po public.saas_purchase_orders%ROWTYPE;
 v_item public.saas_purchase_order_items%ROWTYPE;
 v_stock_version integer;
 v_existing public.saas_goods_receipts%ROWTYPE;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(v_org,
   ARRAY['super_admin','admin','manager']) THEN
  RAISE EXCEPTION 'Goods receipt admin required' USING ERRCODE='42501';
 END IF;
 IF p_receipt_id IS NULL OR p_order_id IS NULL THEN
  RAISE EXCEPTION 'Stable order and receipt IDs required' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_po FROM public.saas_purchase_orders
 WHERE id=p_order_id AND org_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown tenant PO' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_existing FROM public.saas_goods_receipts
 WHERE order_id=p_order_id AND org_id=v_org;
 IF FOUND THEN
   IF v_existing.id<>p_receipt_id THEN
    RAISE EXCEPTION 'PO already received under different GRN ID' USING ERRCODE='23505';
   END IF;
   RETURN jsonb_build_object('order_id',p_order_id,'receipt_id',p_receipt_id,
    'total',v_po.total,'idempotent',true);
 END IF;
 IF v_po.status <> 'draft' THEN
  RAISE EXCEPTION 'PO is not awaiting receipt' USING ERRCODE='23514';
 END IF;
 FOR v_item IN SELECT * FROM public.saas_purchase_order_items
  WHERE order_id=p_order_id AND org_id=v_org ORDER BY product_id LOOP
  SELECT p.version INTO v_stock_version FROM public.products p
  WHERE p.id=v_item.product_id AND p.org_id=v_org
   AND p.deleted_at IS NULL
   AND (p.branch_id IS NULL OR p.branch_id=v_po.branch_id)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO item product cannot receive stock' USING ERRCODE='23514';END IF;
  PERFORM public.adjust_stock(
   v_item.product_id,'purchase',v_item.quantity,v_stock_version,
   'saas_grn',p_receipt_id,'Cloud GRN for PO '||p_order_id::text,
   v_po.branch_id,NULL);
 END LOOP;
 INSERT INTO public.saas_goods_receipts(id,org_id,order_id,created_by)
 VALUES(p_receipt_id,v_org,p_order_id,v_user);
 INSERT INTO public.saas_supplier_payables(
  order_id,org_id,supplier_id,total,paid)
 VALUES(p_order_id,v_org,v_po.supplier_id,v_po.total,0);
 UPDATE public.saas_purchase_orders SET status='received',received_at=now()
 WHERE id=p_order_id AND org_id=v_org;
 RETURN jsonb_build_object('order_id',p_order_id,
  'receipt_id',p_receipt_id,'total',v_po.total,'idempotent',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.saas_create_purchase_order(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.saas_receive_purchase_order(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_create_purchase_order(uuid,uuid,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_receive_purchase_order(uuid,uuid) TO authenticated;
