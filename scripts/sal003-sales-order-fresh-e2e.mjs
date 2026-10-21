/**
 * SAL-003: local-only Postgres/RLS/constraint verification.
 * Run after complete fresh-instance migration replay. Fixture always ROLLBACK.
 */
import { execFileSync } from "node:child_process";
const nested = (value, key) => {
  if (!value || typeof value !== "object") return undefined;
  if (Object.hasOwn(value, key)) return value[key];
  for (const child of Object.values(value)) {
    const next = nested(child, key);
    if (next !== undefined) return next;
  }
};
const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" }));
const url = String(nested(status, "DB_URL") || "");
if (!url) throw new Error("Local Supabase DB_URL required for SAL-003 E2E");
const hostname = new URL(url).hostname;
if (!["127.0.0.1", "localhost", "[::1]"].includes(hostname)) {
  throw new Error("SAL-003 test refuses non-local Postgres: " + hostname);
}

const sql = String.raw`
BEGIN;

DO $check$
DECLARE
  org1 uuid := gen_random_uuid();
  org2 uuid := gen_random_uuid();
  company1 uuid := gen_random_uuid();
  branch1 uuid := gen_random_uuid();
  branch2 uuid := gen_random_uuid();
  warehouse1 uuid := gen_random_uuid();
  customer1 uuid := gen_random_uuid();
  customer2 uuid := gen_random_uuid();
  order1 uuid := gen_random_uuid();
  order2 uuid := gen_random_uuid();
  operation1 uuid := gen_random_uuid();
  operation2 uuid := gen_random_uuid();
  invoice1 uuid := gen_random_uuid();
  duplicate_request uuid := gen_random_uuid();
  payload1 jsonb;
  payload2 jsonb;
  row_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid = 'public.retail_sales_order_intents_v1'::regclass
      AND relrowsecurity = true AND relforcerowsecurity = true
  ) THEN
    RAISE EXCEPTION 'SAL-003 table must force tenant RLS';
  END IF;
  IF has_table_privilege('authenticated', 'public.retail_sales_order_intents_v1', 'SELECT') OR
     has_table_privilege('authenticated', 'public.retail_sales_order_intents_v1', 'INSERT') OR
     has_table_privilege('authenticated', 'public.retail_sales_order_intents_v1', 'UPDATE') OR
     has_table_privilege('anon', 'public.retail_sales_order_intents_v1', 'SELECT') THEN
    RAISE EXCEPTION 'SAL-003 direct client table access unexpectedly granted';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'retail_sales_order_intents_v1'
  ) THEN
    RAISE EXCEPTION 'SAL-003 must not ship premature client policies';
  END IF;

  INSERT INTO public.organizations(id,name) VALUES
    (org1,'SAL-003 isolated org 1'),(org2,'SAL-003 isolated org 2');
  INSERT INTO public.branches(id,name,org_id) VALUES
    (branch1,'SAL-003 main',org1),(branch2,'SAL-003 other',org2);
  INSERT INTO public.warehouses(id,org_id,branch_id,name,code)
    VALUES (warehouse1,org1,branch1,'SAL-003 store','SAL003-W1');
  INSERT INTO public.customers(id,name,org_id,branch_id) VALUES
    (customer1,'SAL-003 customer',org1,branch1),
    (customer2,'SAL-003 tenant 2',org2,branch2);

  payload1 := jsonb_build_object(
    'id',order1,'organizationId',org1,'companyId',company1,
    'branchId',branch1,'warehouseId',warehouse1,'operationId',operation1,
    'customerId',customer1,'status','draft','version',1,'invoiceId',NULL
  );
  INSERT INTO public.retail_sales_order_intents_v1
    (id,org_id,company_id,branch_id,warehouse_id,operation_id,order_number,
      customer_id,status,version,record_json)
    VALUES (order1,org1,company1,branch1,warehouse1,operation1,'SAL003-001',
      customer1,'draft',1,payload1);

  SELECT count(*) INTO row_count FROM public.retail_sales_order_intents_v1;
  IF row_count <> 1 THEN RAISE EXCEPTION 'SAL-003 order insert missing'; END IF;

  BEGIN
    INSERT INTO public.retail_sales_order_intents_v1
      (id,org_id,company_id,branch_id,warehouse_id,operation_id,
       order_number,customer_id,status,version,record_json)
      VALUES (order2,org1,company1,branch1,warehouse1,operation2,
        'SAL003-002',customer2,'draft',1,
        jsonb_build_object('id',order2,'organizationId',org1,
          'companyId',company1,'branchId',branch1,'warehouseId',warehouse1,
          'operationId',operation2,'customerId',customer2,'status','draft',
          'version',1,'invoiceId',NULL));
    RAISE EXCEPTION 'Cross-tenant customer unexpectedly accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    INSERT INTO public.retail_sales_order_intents_v1
      (id,org_id,company_id,branch_id,warehouse_id,operation_id,
       order_number,customer_id,status,version,record_json)
      VALUES (order2,org1,company1,branch2,warehouse1,operation2,
        'SAL003-002',customer1,'draft',1,
        jsonb_build_object('id',order2,'organizationId',org1,
          'companyId',company1,'branchId',branch2,'warehouseId',warehouse1,
          'operationId',operation2,'customerId',customer1,'status','draft',
          'version',1,'invoiceId',NULL));
    RAISE EXCEPTION 'Cross-branch warehouse unexpectedly accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    UPDATE public.retail_sales_order_intents_v1
    SET version=2 WHERE id=order1 AND org_id=org1;
    RAISE EXCEPTION 'Record/column version mismatch unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  payload2 := jsonb_build_object(
    'id',order2,'organizationId',org1,'companyId',company1,
    'branchId',branch1,'warehouseId',warehouse1,'operationId',operation2,
    'customerId',customer1,'status','draft','version',1,'invoiceId',NULL
  );
  INSERT INTO public.retail_sales_order_intents_v1
    (id,org_id,company_id,branch_id,warehouse_id,operation_id,order_number,
      customer_id,status,version,record_json)
    VALUES (order2,org1,company1,branch1,warehouse1,operation2,'SAL003-002',
      customer1,'draft',1,payload2);

  BEGIN
    INSERT INTO public.retail_sales_order_intents_v1
      (id,org_id,company_id,branch_id,warehouse_id,operation_id,
       order_number,customer_id,status,version,record_json)
      VALUES (duplicate_request,org1,company1,branch1,warehouse1,operation1,
        'SAL003-003',customer1,'draft',1,
        jsonb_set(payload1,'{id}',to_jsonb(duplicate_request)));
    RAISE EXCEPTION 'Repeated operation key unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  UPDATE public.retail_sales_order_intents_v1
    SET status='invoiced',invoice_id=invoice1,
        version=2,record_json = jsonb_set(
          jsonb_set(jsonb_set(payload1,'{status}','"invoiced"'::jsonb),
            '{version}','2'::jsonb),
          '{invoiceId}',to_jsonb(invoice1))
    WHERE id=order1 AND org_id=org1;
  BEGIN
    UPDATE public.retail_sales_order_intents_v1
      SET status='invoiced',invoice_id=invoice1,
        version=2,record_json=jsonb_set(
          jsonb_set(jsonb_set(payload2,'{status}','"invoiced"'::jsonb),
            '{version}','2'::jsonb),
          '{invoiceId}',to_jsonb(invoice1))
      WHERE id=order2 AND org_id=org1;
    RAISE EXCEPTION 'Duplicate invoice link unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  SELECT count(*) INTO row_count FROM public.retail_sales_order_intents_v1
    WHERE org_id=org1 AND invoice_id=invoice1;
  IF row_count <> 1 THEN RAISE EXCEPTION 'Duplicate invoice guard did not retain exactly one link'; END IF;
END;
$check$;

ROLLBACK;
`;
const output = execFileSync("psql", [url, "-X", "-v", "ON_ERROR_STOP=1"], {
  input:sql, encoding:"utf8", stdio:["pipe","pipe","inherit"],
});
if (!/ROLLBACK/.test(output)) throw new Error("SAL-003 isolated Postgres test failed to roll back");
console.log("SAL-003 fresh Postgres default-deny/RLS, cross-tenant, version, invoice uniqueness: PASS");
