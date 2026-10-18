import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const migration = "20261018_ubp02_business_profile_foundation.sql";
const sql = fs.readFileSync(path.join(root, "supabase/migrations", migration), "utf8");
const order = fs.readFileSync(path.join(root, "supabase/MIGRATION_ORDER.txt"), "utf8")
  .split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith("#"));

assert.equal(order.filter(n => n === migration).length, 1, "UBP-02 migration must replay exactly once");
assert.ok(order.indexOf(migration) < order.indexOf("20261018_ubp03b_inventory_lot_serial_schema.sql"), "UBP-02 must precede new lot/serial tables");
for (const name of ["business_group", "business_type_code", "feature_config", "feature_config_version"]) {
  assert.match(sql, new RegExp("ADD COLUMN IF NOT EXISTS " + name + "\\b"), "Missing organizations." + name);
}
for (const name of ["attributes", "tracking_mode"]) {
  assert.match(sql, new RegExp("ADD COLUMN IF NOT EXISTS " + name + "\\b"), "Missing products." + name);
}
assert.match(sql, /ALTER TABLE public\.organizations/);
assert.match(sql, /ALTER TABLE public\.products/);
assert.match(sql, /business_group IN \('RETAIL','EXPIRE_BASED','SERIALIZED','DIMENSIONAL','SERVICE'\)/);
assert.match(sql, /tracking_mode IN \('none','lot','serial'\)/);
assert.match(sql, /jsonb_typeof\(feature_config\) = 'object'/);
assert.match(sql, /jsonb_typeof\(attributes\) = 'object'/);
assert.match(sql, /business_group IS NULL AND business_type_code IS NULL/);
for (const index of ["idx_ubp_products_org_barcode", "idx_ubp_products_org_sku", "idx_ubp_sales_org_date"]) {
  assert.match(sql, new RegExp("CREATE INDEX IF NOT EXISTS " + index + "\\b"));
}
assert.doesNotMatch(sql, /\b(DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|UPDATE public\.organizations|UPDATE public\.products)\b/i);
assert.doesNotMatch(sql, /\b(CREATE TABLE|CREATE POLICY|GRANT ALL|DISABLE ROW LEVEL SECURITY)\b/i);
console.log("UBP-02 safe additive tenant/product schema + index contract PASS");
