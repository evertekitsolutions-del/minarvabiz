import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const migrationPath = path.join(repoRoot, "supabase/migrations/20260925_warehouse_core_fk_indexes_batch4.sql");
const sql = fs.readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ");

const expected = [
  ["idx_warehouse_locations_org_id", "public.warehouse_locations", "org_id"],
  ["idx_warehouse_stock_org_id", "public.warehouse_stock", "org_id"],
  ["idx_warehouses_branch_id", "public.warehouses", "branch_id"],
];

for (const [indexName, tableName, columnName] of expected) {
  const fragment = `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columnName})`;
  assert.ok(normalized.includes(fragment), `missing expected FK index: ${fragment}`);
}

assert.equal((sql.match(/CREATE INDEX IF NOT EXISTS/g) ?? []).length, expected.length);
assert.doesNotMatch(sql, /DROP\s+INDEX/i);
assert.doesNotMatch(sql, /ALTER\s+TABLE/i);

console.log("Warehouse-core FK index batch 4 migration contract PASS");
