-- SAL-003 additive staging only: explicitly unactivated retail sales-order intentions.
-- Do NOT run on production without owner approval, controlled RLS/RPC review,
-- PLT-002 company authority, and SQLite/Hybrid integration readiness.
-- Existing service orders, sales and inventory remain authoritative and untouched.

CREATE TABLE IF NOT EXISTS public.retail_sales_order_intents_v1 (
  id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  company_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  operation_id uuid NOT NULL,
  order_number text NOT NULL CHECK (
    char_length(order_number) BETWEEN 1 AND 48 AND
    order_number ~ '^[A-Za-z0-9/_-]+$'
  ),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','confirmed','cancelled','invoiced')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  record_json jsonb NOT NULL CHECK (
    jsonb_typeof(record_json) = 'object' AND
    octet_length(record_json::text) <= 131072
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (org_id, id),
  UNIQUE (org_id, operation_id),
  UNIQUE (org_id, company_id, order_number)
);
CREATE INDEX IF NOT EXISTS idx_retail_sales_order_intents_scoped
  ON public.retail_sales_order_intents_v1
  (org_id, company_id, branch_id, warehouse_id, status, updated_at DESC);

-- Verify all three existing masters are owned by the same org and the
-- warehouse actually belongs to the selected branch. No client-supplied
-- organization or warehouse relation can be used to cross-scope an intent.
CREATE OR REPLACE FUNCTION public.guard_retail_sales_order_intent_scope_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
     WHERE b.id = NEW.branch_id AND b.org_id = NEW.org_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.warehouses w
     WHERE w.id = NEW.warehouse_id AND w.org_id = NEW.org_id
       AND w.branch_id = NEW.branch_id AND w.deleted_at IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id = NEW.customer_id AND c.org_id = NEW.org_id
       AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Retail sales-order tenant/branch/warehouse/customer mismatch'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.org_id IS DISTINCT FROM (NEW.record_json->>'organizationId')::uuid OR
     NEW.company_id IS DISTINCT FROM (NEW.record_json->>'companyId')::uuid OR
     NEW.branch_id IS DISTINCT FROM (NEW.record_json->>'branchId')::uuid OR
     NEW.warehouse_id IS DISTINCT FROM (NEW.record_json->>'warehouseId')::uuid OR
     NEW.customer_id IS DISTINCT FROM (NEW.record_json->>'customerId')::uuid OR
     NEW.id IS DISTINCT FROM (NEW.record_json->>'id')::uuid OR
     NEW.operation_id IS DISTINCT FROM (NEW.record_json->>'operationId')::uuid OR
     NEW.status IS DISTINCT FROM NEW.record_json->>'status' OR
     NEW.version IS DISTINCT FROM (NEW.record_json->>'version')::integer THEN
    RAISE EXCEPTION 'Retail sales-order identity/version payload mismatch'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$guard$;

DROP TRIGGER IF EXISTS retail_sales_order_intents_scope_v1
  ON public.retail_sales_order_intents_v1;
CREATE TRIGGER retail_sales_order_intents_scope_v1
BEFORE INSERT OR UPDATE ON public.retail_sales_order_intents_v1
FOR EACH ROW EXECUTE FUNCTION public.guard_retail_sales_order_intent_scope_v1();

ALTER TABLE public.retail_sales_order_intents_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_sales_order_intents_v1 FORCE ROW LEVEL SECURITY;

-- Intentionally NO member-facing policies or RPCs. Default-deny all reads
-- and writes until the owner-approved authenticated transactional adapter
-- verifies membership, company/branch/warehouse scope, roles and revision.
REVOKE ALL ON public.retail_sales_order_intents_v1 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_retail_sales_order_intent_scope_v1() FROM PUBLIC, anon, authenticated;
