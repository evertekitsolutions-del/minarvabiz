import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
const path = "supabase/migrations/20261021_sal003_sales_order_intents.sql";
const sql = fs.readFileSync(path,"utf8");
const migrations = fs.readFileSync("supabase/MIGRATION_ORDER.txt","utf8");
test("unactivated SAL-003 migration is ordered, tenant/branch constrained and default-deny",()=>{
  assert.equal(migrations.split("\n").filter(l=>l.trim()===path.split("/").at(-1)).length,1);
  for(const fragment of ["CREATE TABLE IF NOT EXISTS public.retail_sales_order_intents_v1",
    "organization", "company_id", "branch_id", "warehouse_id", "customer_id",
    "operation_id", "order_number", "record_json", "FORCE ROW LEVEL SECURITY",
    "ENABLE ROW LEVEL SECURITY", "REVOKE ALL ON public.retail_sales_order_intents_v1",
    "retail_sales_order_intents_scope_v1", "BEFORE INSERT OR UPDATE",
    "w.branch_id = NEW.branch_id", "c.org_id = NEW.org_id", "w.org_id = NEW.org_id",
    "UNIQUE (org_id, operation_id)", "UNIQUE (org_id, company_id, order_number)"]) {
    assert.ok(sql.includes(fragment),fragment);
  }
  assert.doesNotMatch(sql,/CREATE POLICY|GRANT\s+(?:INSERT|UPDATE|DELETE|SELECT)\s+ON/i);
});
