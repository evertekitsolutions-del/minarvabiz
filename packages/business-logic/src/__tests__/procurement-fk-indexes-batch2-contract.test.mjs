import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const migrationPath = path.join(repoRoot, "supabase/migrations/20260925_procurement_fk_indexes_batch2.sql");
const sql = fs.readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ");

const expected = [
  ["idx_goods_receipt_lines_org_id", "public.goods_receipt_lines", "org_id"],
  ["idx_goods_receipt_lines_product_id", "public.goods_receipt_lines", "product_id"],
  ["idx_goods_receipts_branch_id", "public.goods_receipts", "branch_id"],
  ["idx_goods_receipts_created_by", "public.goods_receipts", "created_by"],
  ["idx_purchase_invoice_lines_org_id", "public.purchase_invoice_lines", "org_id"],
  ["idx_purchase_invoice_lines_product_id", "public.purchase_invoice_lines", "product_id"],
  ["idx_purchase_invoices_branch_id", "public.purchase_invoices", "branch_id"],
  ["idx_purchase_invoices_created_by", "public.purchase_invoices", "created_by"],
];

for (const [indexName, tableName, columnName] of expected) {
  const fragment = `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columnName})`;
  assert.ok(normalized.includes(fragment), `missing expected FK index: ${fragment}`);
}

assert.equal((sql.match(/CREATE INDEX IF NOT EXISTS/g) ?? []).length, expected.length);
assert.doesNotMatch(sql, /DROP\s+INDEX/i);
assert.doesNotMatch(sql, /ALTER\s+TABLE/i);

console.log("Procurement FK index batch 2 migration contract PASS");
