import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const migrationPath = path.join(repoRoot, "supabase/migrations/20260925_purchase_order_fk_indexes_batch3.sql");
const sql = fs.readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ");

const expected = [
  ["idx_purchase_order_lines_org_id", "public.purchase_order_lines", "org_id"],
  ["idx_purchase_orders_approved_by", "public.purchase_orders", "approved_by"],
  ["idx_purchase_orders_branch_id", "public.purchase_orders", "branch_id"],
  ["idx_purchase_orders_created_by", "public.purchase_orders", "created_by"],
];

for (const [indexName, tableName, columnName] of expected) {
  const fragment = `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columnName})`;
  assert.ok(normalized.includes(fragment), `missing expected FK index: ${fragment}`);
}

assert.equal((sql.match(/CREATE INDEX IF NOT EXISTS/g) ?? []).length, expected.length);
assert.doesNotMatch(sql, /DROP\s+INDEX/i);
assert.doesNotMatch(sql, /ALTER\s+TABLE/i);

console.log("Purchase-order FK index batch 3 migration contract PASS");
