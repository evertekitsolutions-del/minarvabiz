import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const name = "20261018_ubp03b_inventory_lot_serial_schema.sql";
const sql = fs.readFileSync(path.join(root, "supabase/migrations", name), "utf8");
const order = fs.readFileSync(path.join(root,"supabase/MIGRATION_ORDER.txt"),"utf8")
  .split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith("#"));

test("fresh schema migration order includes lot/serial authority after company profiles",()=>{
 assert.equal(order.filter(x=>x===name).length,1);
 assert.ok(order.indexOf(name)>order.indexOf("20261018_ubp02_business_profile_foundation.sql"));
});

test("batch and serial tables use authoritative products, warehouses and same-tenant composite FK",()=>{
 for(const table of ["inventory_batches","inventory_serial_units"]){
  assert.match(sql,new RegExp("CREATE TABLE IF NOT EXISTS public\\."+table+"\\b"));
  assert.match(sql,new RegExp("ALTER TABLE public\\."+table+" ENABLE ROW LEVEL SECURITY"));
  assert.match(sql,new RegExp("GRANT SELECT ON public\\."+table+" TO authenticated"));
  assert.match(sql,new RegExp("FOR SELECT TO authenticated"));
 }
 for(const parent of ["products","warehouses"]){
  assert.match(sql,new RegExp("REFERENCES public\\."+parent+"\\(org_id, id\\)"));
 }
 assert.match(sql,/FOREIGN KEY \(org_id, product_id, sale_item_id\)/);
 assert.match(sql,/REFERENCES public\.sale_items\(org_id, product_id, id\)/);
});

test("inventory checks protect scarcity, expiry order, uniqueness and serialized unit lifecycle",()=>{
 assert.match(sql,/reserved_quantity <= on_hand_quantity/);
 assert.match(sql,/on_hand_quantity >= 0/);
 assert.match(sql,/expires_on DATE NOT NULL/);
 assert.match(sql,/status IN \('active','blocked'\)/);
 assert.match(sql,/status IN \('available','reserved','sold','blocked','returned'\)/);
 assert.match(sql,/uq_ubp_batches_org_product_warehouse_code/);
 assert.match(sql,/uq_ubp_serial_org_kind_code/);
 assert.match(sql,/idx_ubp_batches_fefo/);
 assert.match(sql,/idx_ubp_serial_available/);
 assert.match(sql,/status <> 'sold' OR sale_item_id IS NOT NULL/);
});

test("read-only authenticated policies; no blanket broad writes or destructive SQL",()=>{
 assert.match(sql,/REVOKE ALL ON public\.inventory_batches FROM PUBLIC, anon, authenticated/);
 assert.match(sql,/REVOKE ALL ON public\.inventory_serial_units FROM PUBLIC, anon, authenticated/);
 assert.match(sql,/om\.user_id = \(SELECT auth\.uid\(\)\)/);
 assert.doesNotMatch(sql,/\b(DROP TABLE|DROP COLUMN|TRUNCATE TABLE|DISABLE ROW LEVEL SECURITY|GRANT ALL.*authenticated)\b/i);
 assert.doesNotMatch(sql,/SECURITY DEFINER/i);
});
