import assert from "node:assert/strict";
import fs from "node:fs";

const migrations = [
  {
    name: "WMS",
    path: "../../../../supabase/migrations/20260919_wms_foundation.sql",
    tables: ["warehouses", "warehouse_locations", "warehouse_stock", "warehouse_transfers"],
  },
  {
    name: "procurement purchase orders",
    path: "../../../../supabase/migrations/20260919_procurement_purchase_orders.sql",
    tables: ["purchase_orders", "purchase_order_lines"],
  },
  {
    name: "procurement goods receipts",
    path: "../../../../supabase/migrations/20260919_goods_receipts.sql",
    tables: ["goods_receipts", "goods_receipt_lines"],
  },
  {
    name: "procurement purchase invoices",
    path: "../../../../supabase/migrations/20260919_purchase_invoices_ap.sql",
    tables: ["purchase_invoices", "purchase_invoice_lines"],
  },
  {
    name: "accounting",
    path: "../../../../supabase/migrations/20260919_accounting_core.sql",
    tables: ["accounts", "journal_entries", "journal_entry_lines"],
  },
];

for (const group of migrations) {
  const sql = fs.readFileSync(new URL(group.path, import.meta.url), "utf8");
  const loopMatch = sql.match(/FOREACH t IN ARRAY ARRAY\[(.*?)\]/s);
  assert.ok(loopMatch, group.name + ": tenant policy table loop must exist");
  const policyTables = loopMatch[1];

  assert.match(sql, /set_current_user_org_id BEFORE INSERT/);
  assert.match(sql, /private\.set_current_user_org_id\(\)/);
  assert.match(sql, /FOR ALL TO authenticated USING \(%s\) WITH CHECK \(%s\)/);
  assert.match(sql, /org_id IS NOT NULL/);
  assert.match(sql, /public\.organization_members/);
  assert.match(sql, /auth\.uid\(\)/);

  for (const table of group.tables) {
    const start = sql.indexOf("CREATE TABLE IF NOT EXISTS public." + table + " (");
    assert.ok(start >= 0, group.name + ": " + table + " table definition must exist");
    const end = sql.indexOf("\n);", start);
    assert.ok(end > start, group.name + ": " + table + " table definition must be complete");
    const block = sql.slice(start, end);

    assert.match(
      block,
      /org_id UUID REFERENCES public\.organizations\(id\)/,
      group.name + ": " + table + " must carry org_id"
    );
    assert.ok(
      sql.includes("ALTER TABLE public." + table + " ENABLE ROW LEVEL SECURITY;"),
      group.name + ": " + table + " must enable RLS"
    );
    assert.ok(
      policyTables.includes("'" + table + "'"),
      group.name + ": " + table + " must be included in the tenant policy/trigger loop"
    );
  }
}


const tenantHelperFix = fs.readFileSync(
  new URL("../../../../supabase/migrations/20260925_tenant_org_helper_uuid_fix.sql", import.meta.url),
  "utf8"
);
assert.match(tenantHelperFix, /CREATE OR REPLACE FUNCTION private\.current_user_org_id\(\)/);
assert.match(tenantHelperFix, /SELECT COUNT\(\*\)/);
assert.match(tenantHelperFix, /ORDER BY org_id::text/);
assert.match(tenantHelperFix, /LIMIT 1/);
assert.doesNotMatch(tenantHelperFix, /MIN\s*\(\s*org_id\s*\)/i);

console.log("ERP tenant-isolation migration contract tests passed");
