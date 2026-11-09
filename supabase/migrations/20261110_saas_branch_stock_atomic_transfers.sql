-- M7: SaaS-only branch allocation and atomic internal transfers.
-- Warehouse-location parity / automatic allocation after POS & GRN remain separate gates.
-- Transfers never change aggregate products.stock_quantity or post phantom GRN/sale movements.
CREATE TABLE IF NOT EXISTS public.saas_branch_stock(
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 product_id uuid NOT NULL REFERENCES public.products(id),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 quantity numeric(14,3) NOT NULL CHECK(quantity>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(product_id,branch_id)
);
CREATE INDEX IF NOT EXISTS saas_branch_stock_org_idx
 ON public.saas_branch_stock(org_id,branch_id,product_id);
CREATE TABLE IF NOT EXISTS public.saas_branch_stock_seeds(
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 product_id uuid NOT NULL UNIQUE REFERENCES public.products(id),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 expected_version integer NOT NULL,
 quantity numeric(14,3) NOT NULL CHECK(quantity>=0),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.saas_branch_stock_transfers(
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 product_id uuid NOT NULL REFERENCES public.products(id),
 source_branch_id uuid NOT NULL REFERENCES public.branches(id),
 destination_branch_id uuid NOT NULL REFERENCES public.branches(id),
 quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 source_balance_after numeric(14,3) NOT NULL CHECK(source_balance_after>=0),
 destination_balance_after numeric(14,3) NOT NULL CHECK(destination_balance_after>=0),
 request_body jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(source_branch_id<>destination_branch_id)
);
CREATE INDEX IF NOT EXISTS saas_branch_stock_transfers_org_idx
 ON public.saas_branch_stock_transfers(org_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.saas_branch_stock_movements(
 event_id uuid NOT NULL,
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 product_id uuid NOT NULL REFERENCES public.products(id),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 event_type text NOT NULL CHECK(event_type IN ('opening_allocation','transfer_out','transfer_in')),
 quantity_delta numeric(14,3) NOT NULL,
 balance_after numeric(14,3) NOT NULL CHECK(balance_after>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(event_id,branch_id),
 CHECK (event_type='opening_allocation' OR quantity_delta<>0)
);
CREATE INDEX IF NOT EXISTS saas_branch_stock_movements_org_idx
 ON public.saas_branch_stock_movements(org_id,product_id,created_at DESC);
ALTER TABLE public.saas_branch_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_branch_stock_seeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_branch_stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_branch_stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_branch_stock_tenant_read ON public.saas_branch_stock
 FOR SELECT TO authenticated USING (EXISTS(
   SELECT 1 FROM public.organization_members m
   WHERE m.org_id=saas_branch_stock.org_id AND m.user_id=(SELECT auth.uid())
 ));
CREATE POLICY saas_branch_seeds_tenant_read ON public.saas_branch_stock_seeds
 FOR SELECT TO authenticated USING (EXISTS(
   SELECT 1 FROM public.organization_members m
   WHERE m.org_id=saas_branch_stock_seeds.org_id AND m.user_id=(SELECT auth.uid())
 ));
CREATE POLICY saas_branch_transfers_tenant_read ON public.saas_branch_stock_transfers
 FOR SELECT TO authenticated USING (EXISTS(
   SELECT 1 FROM public.organization_members m
   WHERE m.org_id=saas_branch_stock_transfers.org_id AND m.user_id=(SELECT auth.uid())
 ));
CREATE POLICY saas_branch_movements_tenant_read ON public.saas_branch_stock_movements
 FOR SELECT TO authenticated USING (EXISTS(
   SELECT 1 FROM public.organization_members m
   WHERE m.org_id=saas_branch_stock_movements.org_id AND m.user_id=(SELECT auth.uid())
 ));
REVOKE ALL ON public.saas_branch_stock,public.saas_branch_stock_seeds,
 public.saas_branch_stock_transfers,public.saas_branch_stock_movements
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.saas_branch_stock,public.saas_branch_stock_seeds,
 public.saas_branch_stock_transfers,public.saas_branch_stock_movements TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_initialize_branch_stock_once(
 p_seed_id uuid,p_product_id uuid,p_branch_id uuid,p_expected_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_user uuid:=(SELECT auth.uid());
 v_p public.products%ROWTYPE;v_prior public.saas_branch_stock_seeds%ROWTYPE;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(
    v_org,ARRAY['super_admin','admin','manager']) THEN
  RAISE EXCEPTION 'Branch stock administrator required' USING ERRCODE='42501';
 END IF;
 IF p_seed_id IS NULL OR p_product_id IS NULL OR p_branch_id IS NULL
  OR p_expected_version IS NULL OR p_expected_version<1 THEN
  RAISE EXCEPTION 'Invalid branch allocation' USING ERRCODE='22023';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('saas-branch-stock:'||p_product_id::text,0));
 SELECT * INTO v_p FROM public.products
 WHERE id=p_product_id AND org_id=v_org AND deleted_at IS NULL
   AND is_active IS TRUE AND coalesce(has_variants,false) IS FALSE FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Non-saleable or cross-tenant product' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.branches b
   WHERE b.id=p_branch_id AND b.org_id=v_org
   AND b.is_active IS TRUE AND b.deleted_at IS NULL)
   OR (v_p.branch_id IS NOT NULL AND v_p.branch_id<>p_branch_id) THEN
  RAISE EXCEPTION 'Opening branch does not match product ownership' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_prior FROM public.saas_branch_stock_seeds
  WHERE product_id=p_product_id OR id=p_seed_id;
 IF FOUND THEN
  IF v_prior.id<>p_seed_id OR v_prior.org_id<>v_org
   OR v_prior.product_id<>p_product_id OR v_prior.branch_id<>p_branch_id
   OR v_prior.expected_version<>p_expected_version THEN
   RAISE EXCEPTION 'Opening allocation already exists with different request'
    USING ERRCODE='23505';
  END IF;
  RETURN pg_catalog.jsonb_build_object('seed_id',p_seed_id,
   'product_id',p_product_id,'branch_id',p_branch_id,
   'quantity',v_prior.quantity,'idempotent',true);
 END IF;
 IF v_p.version<>p_expected_version OR v_p.stock_quantity<0
  OR v_p.stock_quantity>9999999999
  OR round(v_p.stock_quantity,3)<>v_p.stock_quantity
  OR EXISTS(SELECT 1 FROM public.saas_branch_stock WHERE product_id=p_product_id) THEN
  RAISE EXCEPTION 'Product stock/version changed or branch allocation exists'
   USING ERRCODE='40001';
 END IF;
 INSERT INTO public.saas_branch_stock(org_id,product_id,branch_id,quantity)
 VALUES(v_org,p_product_id,p_branch_id,v_p.stock_quantity);
 INSERT INTO public.saas_branch_stock_seeds(
   id,org_id,product_id,branch_id,expected_version,quantity,created_by)
 VALUES(p_seed_id,v_org,p_product_id,p_branch_id,
   p_expected_version,v_p.stock_quantity,v_user);
 -- Initial allocation is informational, NOT a new total stock increase.
 INSERT INTO public.saas_branch_stock_movements(
   event_id,org_id,product_id,branch_id,event_type,quantity_delta,balance_after)
 VALUES(p_seed_id,v_org,p_product_id,p_branch_id,
   'opening_allocation',v_p.stock_quantity,v_p.stock_quantity);
 RETURN pg_catalog.jsonb_build_object('seed_id',p_seed_id,
  'product_id',p_product_id,'branch_id',p_branch_id,
  'quantity',v_p.stock_quantity,'idempotent',false);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.saas_transfer_branch_stock_once(
 p_transfer_id uuid,p_product_id uuid,p_source_branch_id uuid,
 p_destination_branch_id uuid,p_quantity numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_user uuid:=(SELECT auth.uid());
 v_prior public.saas_branch_stock_transfers%ROWTYPE;
 v_product public.products%ROWTYPE;
 v_source numeric(14,3);v_dest numeric(14,3);v_allocated numeric;
 v_payload jsonb;v_result jsonb;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(
    v_org,ARRAY['super_admin','admin','manager']) THEN
  RAISE EXCEPTION 'Branch transfer administrator required' USING ERRCODE='42501';
 END IF;
 IF p_transfer_id IS NULL OR p_product_id IS NULL OR
  p_source_branch_id IS NULL OR p_destination_branch_id IS NULL OR
  p_source_branch_id=p_destination_branch_id OR p_quantity IS NULL
  OR p_quantity<=0 OR p_quantity>9999999 OR round(p_quantity,3)<>p_quantity THEN
  RAISE EXCEPTION 'Invalid branch transfer request' USING ERRCODE='22023';
 END IF;
 v_payload:=pg_catalog.jsonb_build_object('product_id',p_product_id,
  'source',p_source_branch_id,'destination',p_destination_branch_id,
  'quantity',p_quantity);
 -- Product-level advisory lock + row lock serialize all allocations and transfers;
 -- product lock also serializes with global POS/GRN stock updates.
 PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('saas-branch-stock:'||p_product_id::text,0));
 SELECT * INTO v_prior FROM public.saas_branch_stock_transfers
 WHERE id=p_transfer_id;
 IF FOUND THEN
  IF v_prior.org_id<>v_org OR v_prior.request_body IS DISTINCT FROM v_payload THEN
   RAISE EXCEPTION 'Transfer ID reused with a different tenant/request'
    USING ERRCODE='23505';
  END IF;
  RETURN pg_catalog.jsonb_build_object('transfer_id',p_transfer_id,
   'source_after',v_prior.source_balance_after,
   'destination_after',v_prior.destination_balance_after,
   'quantity',v_prior.quantity,'idempotent',true);
 END IF;
 SELECT * INTO v_product FROM public.products
 WHERE id=p_product_id AND org_id=v_org AND deleted_at IS NULL
  AND is_active IS TRUE AND coalesce(has_variants,false) IS FALSE FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS (
   SELECT 1 FROM public.saas_branch_stock_seeds s
   WHERE s.product_id=p_product_id AND s.org_id=v_org
 ) THEN
  RAISE EXCEPTION 'Product not initialized for branch stock' USING ERRCODE='42501';
 END IF;
 IF (SELECT count(*) FROM public.branches b WHERE b.id IN
   (p_source_branch_id,p_destination_branch_id) AND b.org_id=v_org
   AND b.is_active IS TRUE AND b.deleted_at IS NULL)<>2 THEN
  RAISE EXCEPTION 'Transfer branches invalid or outside tenant' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(sum(quantity),0) INTO v_allocated FROM public.saas_branch_stock
  WHERE product_id=p_product_id AND org_id=v_org;
 IF v_allocated IS DISTINCT FROM v_product.stock_quantity THEN
  RAISE EXCEPTION 'Global stock differs from branch allocation; reconcile before transfer'
   USING ERRCODE='40001';
 END IF;
 SELECT quantity INTO v_source FROM public.saas_branch_stock
  WHERE product_id=p_product_id AND org_id=v_org AND branch_id=p_source_branch_id FOR UPDATE;
 IF NOT FOUND OR v_source<p_quantity THEN
  RAISE EXCEPTION 'Insufficient available source branch stock' USING ERRCODE='23514';
 END IF;
 UPDATE public.saas_branch_stock SET quantity=quantity-p_quantity,updated_at=now()
  WHERE product_id=p_product_id AND branch_id=p_source_branch_id AND org_id=v_org
  RETURNING quantity INTO v_source;
 INSERT INTO public.saas_branch_stock(org_id,product_id,branch_id,quantity)
 VALUES(v_org,p_product_id,p_destination_branch_id,p_quantity)
 ON CONFLICT(product_id,branch_id) DO UPDATE
  SET quantity=saas_branch_stock.quantity+EXCLUDED.quantity,updated_at=now()
 WHERE saas_branch_stock.org_id=v_org
 RETURNING quantity INTO v_dest;
 IF v_dest IS NULL THEN
  RAISE EXCEPTION 'Destination branch allocation conflict' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.saas_branch_stock_transfers(
  id,org_id,product_id,source_branch_id,destination_branch_id,quantity,
  source_balance_after,destination_balance_after,request_body,created_by)
 VALUES(p_transfer_id,v_org,p_product_id,p_source_branch_id,p_destination_branch_id,
  p_quantity,v_source,v_dest,v_payload,v_user);
 INSERT INTO public.saas_branch_stock_movements(
  event_id,org_id,product_id,branch_id,event_type,quantity_delta,balance_after)
 VALUES
  (p_transfer_id,v_org,p_product_id,p_source_branch_id,'transfer_out',-p_quantity,v_source),
  (p_transfer_id,v_org,p_product_id,p_destination_branch_id,'transfer_in',p_quantity,v_dest);
 -- Defensive assertion: internal transfers must conserve aggregate stock exactly.
 IF (SELECT coalesce(sum(quantity),0) FROM public.saas_branch_stock
     WHERE product_id=p_product_id AND org_id=v_org)<>v_product.stock_quantity THEN
  RAISE EXCEPTION 'Non-conserving stock transfer rejected' USING ERRCODE='40001';
 END IF;
 RETURN pg_catalog.jsonb_build_object('transfer_id',p_transfer_id,
  'source_after',v_source,'destination_after',v_dest,
  'quantity',p_quantity,'idempotent',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.saas_initialize_branch_stock_once(uuid,uuid,uuid,integer)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.saas_transfer_branch_stock_once(uuid,uuid,uuid,uuid,numeric)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_initialize_branch_stock_once(uuid,uuid,uuid,integer)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_transfer_branch_stock_once(uuid,uuid,uuid,uuid,numeric)
 TO authenticated;
