-- M7: keep tenant branch allocations transactionally reconciled with global POS,
-- GRN and adjustments. Existing uninitialized products keep legacy behavior.
-- Stock changes on initialized products are rejected unless a matching branch
-- movement is recorded in the same transaction. Transfer RPC remains unchanged.

ALTER TABLE public.saas_branch_stock_movements
 DROP CONSTRAINT IF EXISTS saas_branch_stock_movements_event_type_check;
ALTER TABLE public.saas_branch_stock_movements
 ADD CONSTRAINT saas_branch_stock_movements_event_type_check
 CHECK(event_type IN('opening_allocation','transfer_out','transfer_in','stock_in','stock_out'));

-- Fix existing p_branch_id being ignored when recording a movement. The branch
-- is an auditable part of the write, not inferred from an optional product branch.
CREATE OR REPLACE FUNCTION public.adjust_stock(
 p_product_id uuid,p_movement_type text,p_quantity numeric,
 p_expected_version integer,p_reference_type text DEFAULT NULL,
 p_reference_id uuid DEFAULT NULL,p_notes text DEFAULT NULL,
 p_branch_id uuid DEFAULT NULL,p_device_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_current numeric(14,3);
 v_current_version integer;
 v_new numeric(14,3);
 v_delta numeric(14,3);
 v_product_branch uuid;
 v_effective_branch uuid;
 v_org uuid;
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN
  RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
 END IF;
 v_org:=private.current_user_org_id();
 IF v_org IS NULL OR NOT public.user_has_org_role(
  v_org,ARRAY['super_admin','admin','manager']) THEN
  RAISE EXCEPTION 'Role not allowed to adjust stock' USING ERRCODE='42501';
 END IF;
 IF p_quantity IS NULL OR p_quantity=0 OR abs(p_quantity)>999999999
  OR p_expected_version IS NULL OR p_expected_version<1
  OR p_product_id IS NULL
  OR round(p_quantity,3)<>p_quantity THEN
  RAISE EXCEPTION 'Invalid stock quantity or expected version' USING ERRCODE='22023';
 END IF;
 SELECT stock_quantity,version,branch_id
 INTO v_current,v_current_version,v_product_branch
 FROM public.products
 WHERE id=p_product_id AND org_id=v_org AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Product not found' USING ERRCODE='P0002';
 END IF;
 IF v_current_version<>p_expected_version THEN
  RAISE EXCEPTION 'Version conflict for product %',p_product_id USING ERRCODE='40001';
 END IF;
 v_effective_branch:=coalesce(p_branch_id,v_product_branch);
 IF v_effective_branch IS NOT NULL THEN
  IF (v_product_branch IS NOT NULL AND v_product_branch<>v_effective_branch)
   OR NOT EXISTS(SELECT 1 FROM public.branches b
    WHERE b.id=v_effective_branch AND b.org_id=v_org
     AND b.deleted_at IS NULL AND b.is_active IS TRUE) THEN
   RAISE EXCEPTION 'Stock movement branch outside product tenant'
    USING ERRCODE='42501';
  END IF;
 END IF;
 CASE p_movement_type
 WHEN 'stock_in' THEN v_delta:=abs(p_quantity);
 WHEN 'purchase' THEN v_delta:=abs(p_quantity);
 WHEN 'return' THEN v_delta:=abs(p_quantity);
 WHEN 'stock_out' THEN v_delta:=-abs(p_quantity);
 WHEN 'sale' THEN v_delta:=-abs(p_quantity);
 WHEN 'transfer' THEN v_delta:=-abs(p_quantity);
 WHEN 'adjustment' THEN v_delta:=p_quantity;
 ELSE RAISE EXCEPTION 'Unsupported stock movement type' USING ERRCODE='22023';
 END CASE;
 v_new:=round(v_current+v_delta,3);
 UPDATE public.products SET stock_quantity=v_new,
  updated_at=pg_catalog.now(),version=v_current_version+1
 WHERE id=p_product_id AND org_id=v_org AND version=p_expected_version;
 INSERT INTO public.inventory_transactions(
  id,product_id,movement_type,quantity,balance_after,reference_type,
  reference_id,notes,created_at,created_by,branch_id,device_id,org_id)
 VALUES(pg_catalog.gen_random_uuid(),p_product_id,p_movement_type,p_quantity,
  v_new,p_reference_type,p_reference_id,p_notes,pg_catalog.now(),
  (SELECT auth.uid()),v_effective_branch,p_device_id,v_org);
 RETURN pg_catalog.jsonb_build_object(
  'product_id',p_product_id,'stock_quantity',v_new,
  'version',v_current_version+1);
END;
$fn$;
REVOKE ALL ON FUNCTION public.adjust_stock(uuid,text,numeric,integer,text,uuid,text,uuid,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid,text,numeric,integer,text,uuid,text,uuid,uuid)
 TO authenticated;


-- A branchless product can be stocked at any authorized branch. Fixed-branch
-- products remain restricted to their original branch.
CREATE OR REPLACE FUNCTION public.saas_adjust_stock_once(
 p_mutation_id uuid,p_product_id uuid,p_movement_type text,
 p_quantity numeric,p_expected_version integer,p_branch_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_user uuid:=(SELECT auth.uid());
 v_org uuid;
 v_request jsonb;
 v_prior public.saas_inventory_mutation_receipts%ROWTYPE;
 v_result jsonb;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR p_mutation_id IS NULL OR p_product_id IS NULL
 OR NOT public.user_has_org_role(v_org,ARRAY['super_admin','admin','manager']) THEN
  RAISE EXCEPTION 'Inventory operator is not authorized' USING ERRCODE='42501';
 END IF;
 IF p_movement_type NOT IN('stock_in','stock_out','adjustment')
  OR p_quantity IS NULL OR p_quantity=0 OR abs(p_quantity)>999999999
  OR p_expected_version IS NULL OR p_expected_version<1
  OR round(p_quantity,3)<>p_quantity THEN
  RAISE EXCEPTION 'Invalid stock adjustment input' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.products p
  WHERE p.id=p_product_id AND p.org_id=v_org
   AND p.deleted_at IS NULL AND
   (p_branch_id IS NULL OR p.branch_id IS NULL OR p.branch_id=p_branch_id)) THEN
  RAISE EXCEPTION 'Product branch or tenant does not match' USING ERRCODE='42501';
 END IF;
 v_request:=pg_catalog.jsonb_build_object(
  'product_id',p_product_id,'type',p_movement_type,
  'quantity',p_quantity,'version',p_expected_version,'branch_id',p_branch_id);
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('inventory:'||v_org::text||':'||p_mutation_id::text,0));
 SELECT * INTO v_prior FROM public.saas_inventory_mutation_receipts
  WHERE id=p_mutation_id AND org_id=v_org;
 IF FOUND THEN
  IF v_prior.request_body IS DISTINCT FROM v_request THEN
   RAISE EXCEPTION 'Idempotency key reused with different inventory payload'
    USING ERRCODE='23505';
  END IF;
  RETURN v_prior.result_body||pg_catalog.jsonb_build_object('idempotent',true);
 END IF;
 v_result:=public.adjust_stock(
  p_product_id,p_movement_type,p_quantity,p_expected_version,
  'saas_inventory',p_mutation_id,
  'Cloud-confirmed inventory adjustment',p_branch_id,NULL);
 INSERT INTO public.saas_inventory_mutation_receipts(
  id,org_id,product_id,request_body,result_body,created_by)
 VALUES(p_mutation_id,v_org,p_product_id,v_request,v_result,v_user);
 RETURN v_result||pg_catalog.jsonb_build_object(
  'idempotent',false,'mutation_id',p_mutation_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.saas_adjust_stock_once(uuid,uuid,text,numeric,integer,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_adjust_stock_once(uuid,uuid,text,numeric,integer,uuid)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_reconcile_branch_stock_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_stock numeric;v_aggregate numeric;v_delta numeric(14,3);
 v_after numeric(14,3);v_product_branch uuid;v_event_type text;
BEGIN
 -- Only previously seeded products participate. Every unseeded product keeps
 -- the original POS/GRN/stock movement behavior.
 IF NOT EXISTS(SELECT 1 FROM public.saas_branch_stock_seeds s
  WHERE s.product_id=NEW.product_id AND s.org_id=NEW.org_id) THEN
  RETURN NEW;
 END IF;
 IF (SELECT auth.uid()) IS NULL OR NOT public.user_has_org_role(
  NEW.org_id,ARRAY['super_admin','admin','manager','cashier']) THEN
  RAISE EXCEPTION 'Branch stock movement actor not authorized'
   USING ERRCODE='42501';
 END IF;
 IF NEW.quantity IS NULL OR NEW.quantity=0
  OR round(NEW.quantity,3)<>NEW.quantity OR NEW.branch_id IS NULL
  OR NEW.org_id IS NULL THEN
  RAISE EXCEPTION 'Branch stock movement missing quantity/branch'
   USING ERRCODE='40001';
 END IF;
 SELECT p.stock_quantity,p.branch_id INTO v_stock,v_product_branch
 FROM public.products p WHERE p.id=NEW.product_id AND p.org_id=NEW.org_id
 AND p.deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Stock movement product not found' USING ERRCODE='42501';
 END IF;
 IF (v_product_branch IS NOT NULL AND v_product_branch<>NEW.branch_id)
  OR NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=NEW.branch_id
    AND b.org_id=NEW.org_id AND b.is_active IS TRUE AND b.deleted_at IS NULL) THEN
  RAISE EXCEPTION 'Branch stock movement invalid branch/tenant'
   USING ERRCODE='42501';
 END IF;
 CASE NEW.movement_type
 WHEN 'stock_in' THEN v_delta:=abs(NEW.quantity);
 WHEN 'purchase' THEN v_delta:=abs(NEW.quantity);
 WHEN 'return' THEN v_delta:=abs(NEW.quantity);
 WHEN 'stock_out' THEN v_delta:=-abs(NEW.quantity);
 WHEN 'sale' THEN v_delta:=-abs(NEW.quantity);
 WHEN 'transfer' THEN v_delta:=-abs(NEW.quantity);
 WHEN 'adjustment' THEN v_delta:=NEW.quantity;
 ELSE RAISE EXCEPTION 'Unsupported movement on seeded branch stock'
   USING ERRCODE='40001';
 END CASE;
 SELECT coalesce(sum(s.quantity),0) INTO v_aggregate
 FROM public.saas_branch_stock s
 WHERE s.product_id=NEW.product_id AND s.org_id=NEW.org_id;
 IF v_stock IS DISTINCT FROM NEW.balance_after
  OR v_aggregate IS DISTINCT FROM v_stock-v_delta THEN
  RAISE EXCEPTION 'Stock movement/global branch allocation conflict'
   USING ERRCODE='40001';
 END IF;
 IF v_delta>0 THEN
  INSERT INTO public.saas_branch_stock(
   org_id,product_id,branch_id,quantity)
  VALUES(NEW.org_id,NEW.product_id,NEW.branch_id,v_delta)
  ON CONFLICT(product_id,branch_id) DO UPDATE
  SET quantity=saas_branch_stock.quantity+EXCLUDED.quantity,
    updated_at=pg_catalog.now()
  WHERE saas_branch_stock.org_id=NEW.org_id
  RETURNING quantity INTO v_after;
 ELSE
  UPDATE public.saas_branch_stock SET
   quantity=quantity+v_delta,updated_at=pg_catalog.now()
  WHERE org_id=NEW.org_id AND product_id=NEW.product_id
   AND branch_id=NEW.branch_id AND quantity>=-v_delta
  RETURNING quantity INTO v_after;
 END IF;
 IF v_after IS NULL THEN
  RAISE EXCEPTION 'Insufficient stock at selected branch'
   USING ERRCODE='23514';
 END IF;
 v_event_type:=CASE WHEN v_delta>0 THEN 'stock_in' ELSE 'stock_out' END;
 INSERT INTO public.saas_branch_stock_movements(
  event_id,org_id,product_id,branch_id,event_type,quantity_delta,balance_after)
 VALUES(NEW.id,NEW.org_id,NEW.product_id,NEW.branch_id,
  v_event_type,v_delta,v_after);
 SELECT coalesce(sum(s.quantity),0) INTO v_aggregate
 FROM public.saas_branch_stock s WHERE s.product_id=NEW.product_id
 AND s.org_id=NEW.org_id;
 IF v_aggregate IS DISTINCT FROM v_stock THEN
  RAISE EXCEPTION 'Branch movement must conserve global stock'
   USING ERRCODE='40001';
 END IF;
 RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS saas_reconcile_branch_stock_movement_trg
 ON public.inventory_transactions;
CREATE TRIGGER saas_reconcile_branch_stock_movement_trg
 AFTER INSERT ON public.inventory_transactions FOR EACH ROW
 EXECUTE FUNCTION public.saas_reconcile_branch_stock_movement();
REVOKE ALL ON FUNCTION public.saas_reconcile_branch_stock_movement()
 FROM PUBLIC,anon,authenticated;

-- Protect against direct product stock writes that do not create a matching
-- branch movement. Constraint is checked at statement transaction end/COMMIT,
-- after the inventory movement trigger has executed.
CREATE OR REPLACE FUNCTION public.saas_guard_branch_stock_total()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_total numeric;
BEGIN
 IF NEW.stock_quantity IS NOT DISTINCT FROM OLD.stock_quantity
  OR NOT EXISTS(SELECT 1 FROM public.saas_branch_stock_seeds
   WHERE product_id=NEW.id AND org_id=NEW.org_id) THEN
  RETURN NEW;
 END IF;
 SELECT coalesce(sum(s.quantity),0) INTO v_total
 FROM public.saas_branch_stock s
 WHERE s.product_id=NEW.id AND s.org_id=NEW.org_id;
 IF v_total IS DISTINCT FROM
   (SELECT p.stock_quantity FROM public.products p WHERE p.id=NEW.id) THEN
  RAISE EXCEPTION 'Product stock change missing branch stock movement'
   USING ERRCODE='40001';
 END IF;
 RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS saas_guard_branch_stock_total_trg ON public.products;
CREATE CONSTRAINT TRIGGER saas_guard_branch_stock_total_trg
 AFTER UPDATE ON public.products DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW WHEN (OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity)
 EXECUTE FUNCTION public.saas_guard_branch_stock_total();
REVOKE ALL ON FUNCTION public.saas_guard_branch_stock_total()
 FROM PUBLIC,anon,authenticated;
