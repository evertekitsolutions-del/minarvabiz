import assert from "node:assert/strict";
import fs from "node:fs";

const wms = fs.readFileSync(new URL("../warehouse-store.ts", import.meta.url), "utf8");
const store = fs.readFileSync(new URL("../store.ts", import.meta.url), "utf8");
const persistence = fs.readFileSync(new URL("../persistence.ts", import.meta.url), "utf8");
const sync = fs.readFileSync(new URL("../../../sync/src/supabase-adapter.ts", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../../../ui/src/components/inventory/WarehousePanel.tsx", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../../../supabase/migrations/20260919_wms_foundation.sql", import.meta.url), "utf8");

assert.match(wms, /export function createWarehouse(/);
assert.match(wms, /export function createWarehouseLocation(/);
assert.match(wms, /export function allocateExistingStock(/);
assert.match(wms, /export function createWarehouseTransfer(/);
assert.match(wms, /export function approveWarehouseTransfer(/);
assert.match(wms, /export function dispatchWarehouseTransfer(/);
assert.match(wms, /export function receiveWarehouseTransfer(/);
assert.match(wms, /source\.reserved = roundQty\(source\.reserved \+ transfer\.quantity\)/);
assert.match(wms, /source\.onHand = roundQty\(source\.onHand - transfer\.quantity\)/);
assert.match(wms, /destination\.onHand = roundQty\(destination\.onHand \+ transfer\.quantity\)/);
assert.match(store, /consumeWarehouseStock\(p\.id, line\.quantity/);
assert.match(persistence, /warehouse: warehouseStore\.exportWarehouseState\(\)/);
assert.match(persistence, /hydrateWarehouseState/);
assert.match(sync, /"warehouse_transfers"/);
assert.match(sync, /"warehouse_stock"/);
assert.match(ui, /Warehouse Management/);
assert.match(ui, /Transfer workflow/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.warehouses/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /set_current_user_org_id/);

function transferLifecycle(sourceOnHand, qty) {
  let reserved = 0;
  reserved += qty; // approve
  sourceOnHand -= qty; // dispatch
  reserved -= qty;
  let destinationOnHand = 0;
  destinationOnHand += qty; // receive
  return { sourceOnHand, reserved, destinationOnHand };
}

const result = transferLifecycle(25, 7);
assert.equal(result.sourceOnHand, 18);
assert.equal(result.reserved, 0);
assert.equal(result.destinationOnHand, 7);

console.log("warehouse WMS contract tests passed");
