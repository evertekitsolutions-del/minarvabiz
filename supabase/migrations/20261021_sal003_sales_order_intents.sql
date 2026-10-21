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
  invoice_id uuid,
  CONSTRAINT retail_sales_order_invoice_status_v1
    CHECK ((status = 'invoiced' AND invoice_id IS NOT NULL)
      OR (status <> 'invoiced' AND invoice_id IS NULL)),
  record_json jsonb NOT NULL CHECK (
    jsonb_typeof(record_json) = 'object' AND
    octet_length(record_json::text) <= 131072
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (org_id, id),
  UNIQUE (org_id, operation_id),
  UNIQUE (org_id, company_id, order_number),
  UNIQUE (org_id, invoice_id)
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
     NEW.invoice_id IS DISTINCT FROM NULLIF(NEW.record_json->>'invoiceId', '')::uuid OR
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

-- SAL-003 durable cloud receiver *schema only*: NO RPC, policy or public write
-- permission. Future authenticated transactional RPC must atomically persist
-- each authoritative order revision plus its immutable inbox event.
CREATE TABLE IF NOT EXISTS public.retail_sales_order_sync_inbox_v1 (
  org_id uuid NOT NULL,
  company_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  order_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  order_version integer NOT NULL CHECK (order_version > 0),
  event_type text NOT NULL CHECK (
    event_type IN ('created','amended','confirmed','cancelled','invoiced','archived','restored')
  ),
  payload_json jsonb NOT NULL CHECK (
    jsonb_typeof(payload_json) = 'object' AND
    octet_length(payload_json::text) <= 262144
  ),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, operation_id),
  UNIQUE (org_id, order_id, order_version),
  FOREIGN KEY (org_id, order_id)
    REFERENCES public.retail_sales_order_intents_v1(org_id, id)
);

CREATE INDEX IF NOT EXISTS idx_retail_sales_order_sync_inbox_v1_scope
  ON public.retail_sales_order_sync_inbox_v1
  (org_id, company_id, branch_id, warehouse_id, order_id, order_version);

CREATE OR REPLACE FUNCTION public.guard_retail_sales_order_sync_inbox_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $guard$
BEGIN
  -- Inbox event and nested immutable order identity must agree with
  -- authoritative order scope, revision and the recorded operation key.
  IF NOT EXISTS (
    SELECT 1 FROM public.retail_sales_order_intents_v1 so
    WHERE so.org_id = NEW.org_id AND so.id = NEW.order_id
      AND so.company_id = NEW.company_id
      AND so.branch_id = NEW.branch_id
      AND so.warehouse_id = NEW.warehouse_id
      AND so.version >= NEW.order_version
  ) THEN
    RAISE EXCEPTION 'SAL-003 inbox tenant or order revision mismatch'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.operation_id IS DISTINCT FROM (NEW.payload_json->>'operationId')::uuid OR
     NEW.org_id IS DISTINCT FROM (NEW.payload_json->>'organizationId')::uuid OR
     NEW.company_id IS DISTINCT FROM (NEW.payload_json->>'companyId')::uuid OR
     NEW.branch_id IS DISTINCT FROM (NEW.payload_json->>'branchId')::uuid OR
     NEW.warehouse_id IS DISTINCT FROM (NEW.payload_json->>'warehouseId')::uuid OR
     NEW.order_id IS DISTINCT FROM (NEW.payload_json->>'orderId')::uuid OR
     NEW.order_version IS DISTINCT FROM (NEW.payload_json->>'orderVersion')::integer OR
     NEW.event_type IS DISTINCT FROM NEW.payload_json->>'eventType' OR
     NEW.order_id IS DISTINCT FROM (NEW.payload_json->'order'->>'id')::uuid OR
     NEW.org_id IS DISTINCT FROM (NEW.payload_json->'order'->>'organizationId')::uuid OR
     NEW.company_id IS DISTINCT FROM (NEW.payload_json->'order'->>'companyId')::uuid OR
     NEW.branch_id IS DISTINCT FROM (NEW.payload_json->'order'->>'branchId')::uuid OR
     NEW.warehouse_id IS DISTINCT FROM (NEW.payload_json->'order'->>'warehouseId')::uuid OR
     NEW.order_version IS DISTINCT FROM (NEW.payload_json->'order'->>'version')::integer OR
     NEW.operation_id IS DISTINCT FROM (NEW.payload_json->'order'->>'lastOperationId')::uuid
  THEN
    RAISE EXCEPTION 'SAL-003 inbox JSON event identity mismatch'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$guard$;

DROP TRIGGER IF EXISTS retail_sales_order_sync_inbox_scope_v1
  ON public.retail_sales_order_sync_inbox_v1;
CREATE TRIGGER retail_sales_order_sync_inbox_scope_v1
BEFORE INSERT OR UPDATE ON public.retail_sales_order_sync_inbox_v1
FOR EACH ROW EXECUTE FUNCTION public.guard_retail_sales_order_sync_inbox_v1();

ALTER TABLE public.retail_sales_order_sync_inbox_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_sales_order_sync_inbox_v1 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.retail_sales_order_sync_inbox_v1 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_retail_sales_order_sync_inbox_v1() FROM PUBLIC, anon, authenticated;
