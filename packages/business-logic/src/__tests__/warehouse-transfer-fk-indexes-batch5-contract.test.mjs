import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const migrationPath = path.join(repoRoot, "supabase/migrations/20260925_warehouse_transfer_fk_indexes_batch5.sql");
const sql = fs.readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ");

const expected = [
  ["idx_warehouse_transfers_created_by", "public.warehouse_transfers", "created_by"],
  ["idx_warehouse_transfers_destination_location_id", "public.warehouse_transfers", "destination_location_id"],
  ["idx_warehouse_transfers_destination_warehouse_id", "public.warehouse_transfers", "destination_warehouse_id"],
  ["idx_warehouse_transfers_product_id", "public.warehouse_transfers", "product_id"],
  ["idx_warehouse_transfers_source_location_id", "public.warehouse_transfers", "source_location_id"],
  ["idx_warehouse_transfers_source_warehouse_id", "public.warehouse_transfers", "source_warehouse_id"],
];

for (const [indexName, tableName, columnName] of expected) {
  const fragment = `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columnName})`;
  assert.ok(normalized.includes(fragment), `missing expected FK index: ${fragment}`);
}

assert.equal((sql.match(/CREATE INDEX IF NOT EXISTS/g) ?? []).length, expected.length);
assert.doesNotMatch(sql, /DROP\s+INDEX/i);
assert.doesNotMatch(sql, /ALTER\s+TABLE/i);

console.log("Warehouse-transfer FK index batch 5 migration contract PASS");
