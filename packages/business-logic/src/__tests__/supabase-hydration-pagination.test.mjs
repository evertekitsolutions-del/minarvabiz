import assert from "node:assert/strict";
import fs from "node:fs";

const postgrest = fs.readFileSync(
  new URL("../../../database/src/client/postgrest.ts", import.meta.url),
  "utf8"
);
const adapter = fs.readFileSync(
  new URL("../../../database/src/adapters/supabase.ts", import.meta.url),
  "utf8"
);
const dataSource = fs.readFileSync(
  new URL("../../../../apps/web/src/lib/data-source.ts", import.meta.url),
  "utf8"
);

assert.match(postgrest, /export async function pgSelectAll<T>/);
assert.match(postgrest, /pageSize: number = 500/);
assert.match(postgrest, /pageSize > 1000/);
assert.match(postgrest, /limit=\$\{pageSize\}&offset=\$\{offset\}/);
assert.match(postgrest, /if \(rows\.length < pageSize\) return \{ data: all, error: null \}/);
assert.match(postgrest, /offset \+= rows\.length/);
assert.match(postgrest, /pgSelectAll query must not include limit or offset/);

for (const table of ["customers", "products", "sales", "orders"]) {
  assert.match(
    adapter,
    new RegExp(`pgSelectAll<Record<string, unknown>>\\(cfg, "${table}"`)
  );
}

const hydrationBlock = dataSource.slice(
  dataSource.indexOf("export async function hydrateStoresFromSupabase"),
  dataSource.indexOf("registerRemoteWriter({")
);
for (const table of [
  "categories", "expenses", "purchases", "suppliers", "laundry_orders",
  "staff_members", "payments", "warehouses", "warehouse_locations",
  "warehouse_stock", "warehouse_transfers", "purchase_orders",
  "purchase_order_lines", "goods_receipts", "goods_receipt_lines",
  "purchase_invoices", "purchase_invoice_lines", "accounts",
  "journal_entries", "journal_entry_lines"
]) {
  assert.match(
    hydrationBlock,
    new RegExp(`pgSelectAll<Record<string, unknown>>\\(cfg, "${table}"`)
  );
  assert.doesNotMatch(
    hydrationBlock,
    new RegExp(`pgSelect<Record<string, unknown>>\\(cfg, "${table}"`)
  );
}

for (const order of [
  "order=name.asc,id.asc",
  "order=created_at.desc,id.asc",
  "order=entry_date.desc,created_at.desc,id.asc"
]) {
  assert.ok(dataSource.includes(order) || adapter.includes(order), `missing deterministic pagination order: ${order}`);
}

console.log("Supabase hydration pagination contract tests passed");
