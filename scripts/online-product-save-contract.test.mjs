import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchesProductCloudReceipt, productCloudColumns } from "../apps/web/src/lib/online-product-receipt.ts";

const id = "b0ab0f88-381d-44f0-8aad-ac60093a415a";
const tenant = "5269ca08-ddca-4ca6-805e-29621add49aa";
const row = Object.freeze({
  id, org_id: tenant, version: 1, deleted_at: null, name: "Silk Saree",
  sku: null, barcode: "871000", category_id: null, unit: "pcs",
  cost_price: "100.50", selling_price: "1800.00",
  stock_quantity: "3.000", minimum_stock: "1", is_active: true,
});
const requested = Object.freeze({
  name: "Silk Saree", sku: null, barcode: "871000", category_id: null,
  unit: "pcs", cost_price: 100.5, selling_price: 1800,
  stock_quantity: 3, minimum_stock: 1, is_active: true,
});

test("verified receipt requires exact authenticated owner, id and version", () => {
  assert.equal(matchesProductCloudReceipt(row, requested, id, tenant, 1), true);
  assert.equal(matchesProductCloudReceipt(null, requested, id, tenant, 1), false);
  assert.equal(matchesProductCloudReceipt(row, requested, "unrelated-id", tenant, 1), false);
  assert.equal(matchesProductCloudReceipt(row, requested, id, "other-tenant", 1), false);
  assert.equal(matchesProductCloudReceipt(row, requested, id, tenant, 2), false);
  assert.equal(matchesProductCloudReceipt({ ...row, deleted_at: "2026-11-09" }, requested, id, tenant, 1), false);
});

test("matching version without matching values must fail closed", () => {
  for (const field of productCloudColumns) {
    const changed = { ...row, [field]: field === "is_active" ? false : field === "sku" || field === "category_id" ? "unexpected" : "incorrect" };
    assert.equal(matchesProductCloudReceipt(changed, requested, id, tenant, 1), false, field);
  }
  assert.equal(matchesProductCloudReceipt({ ...row, stock_quantity: "2.999" }, requested, id, tenant, 1), false);
  assert.equal(matchesProductCloudReceipt({ ...row, cost_price: "not a number" }, requested, id, tenant, 1), false);
  assert.equal(matchesProductCloudReceipt({ ...row, cost_price: "" }, requested, id, tenant, 1), false);
});

test("web route awaits Supabase and never closes on unconfirmed save", () => {
  const route = readFileSync("apps/web/src/app/(app)/products/page.tsx", "utf8");
  const service = readFileSync("apps/web/src/lib/online-product-save.ts", "utf8");
  assert.match(route, /window.addEventListener\("minarva:data-hydrated", onCloudHydrated\)/);
  assert.match(route, /window.removeEventListener\("minarva:data-hydrated", onCloudHydrated\)/);
  assert.match(route, /await saveProductOnline\(/);
  assert.match(route, /if \(saveInFlight\.current\) return/);
  assert.match(route, /pendingCreateId\.current \?\?= crypto\.randomUUID\(\)/);
  assert.match(route, /setOpen\(false\);\s*setError\(null\);\s*resetForm\(\);/);
  assert.ok(service.includes('await pgSelect<Record<string, unknown>>(authCfg, "products", ownerFilter)'));
  assert.match(service, /matchesProductCloudReceipt\(/);
  assert.match(service, /getSessionToken\(\) !== token/);
  assert.doesNotMatch(route, /void\s+saveProductOnline/);
  assert.match(route, /Online CSV import is blocked/);
  assert.match(route, /await saveCategoryOnline\(/);
  assert.match(service, /Category NOT confirmed in Supabase/);
  assert.match(route, /await saveStockAdjustmentOnline\(/);
  assert.match(service, /await pgRpc<Record<string, unknown>>\(authCfg, "adjust_stock"/);
  assert.match(service, /"inventory_transactions"/);
  assert.match(service, /p_reference_id: referenceId/);
  const atomicSql = readFileSync("supabase/migrations/20261109_saas_atomic_product_opening_stock.sql", "utf8");
  assert.match(service, /"create_product_with_opening_stock"/);
  assert.match(service, /p_stock_quantity: fields\.stockQuantity/);
  assert.doesNotMatch(service, /return saveStockAdjustmentOnline\(/, "opening stock cannot split into a second write");
  assert.match(atomicSql, /SECURITY INVOKER/);
  assert.match(atomicSql, /ON CONFLICT \(id\) DO NOTHING/);
  assert.match(atomicSql, /INSERT INTO public\.inventory_transactions/);
  assert.match(atomicSql, /RAISE EXCEPTION 'Atomic opening stock receipt missing or duplicated'/);
  assert.match(atomicSql, /CREATE UNIQUE INDEX IF NOT EXISTS inventory_one_opening_receipt_per_product/);
  assert.match(service, /movement\.created_by !== user\.id/);
});
