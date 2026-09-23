import assert from "node:assert/strict";
import fs from "node:fs";

const remoteWrite = fs.readFileSync(new URL("../remote-write.ts", import.meta.url), "utf8");
const persistence = fs.readFileSync(new URL("../persistence.ts", import.meta.url), "utf8");
const syncAdapter = fs.readFileSync(new URL("../../../sync/src/supabase-adapter.ts", import.meta.url), "utf8");
const webDataSource = fs.readFileSync(new URL("../../../../apps/web/src/lib/data-source.ts", import.meta.url), "utf8");

const tables = [
  ["warehouses", "Warehouse", "upsertWarehouse", "warehouses"],
  ["warehouse_locations", "WarehouseLocation", "upsertWarehouseLocation", "locations"],
  ["warehouse_stock", "WarehouseStockPosition", "upsertWarehouseStock", "stock"],
  ["warehouse_transfers", "WarehouseTransfer", "upsertWarehouseTransfer", "transfers"],
];

for (const [table, typeName, writerMethod, hydrateKey] of tables) {
  assert.match(remoteWrite, new RegExp(writerMethod + "\\?:"));
  assert.match(remoteWrite, new RegExp("enqueueOutbox\\(\\\"" + table + "\\\""));
  assert.match(syncAdapter, new RegExp("case \\\"" + table + "\\\":"));
  assert.match(syncAdapter, new RegExp("\\\"" + table + "\\\""));
  assert.match(webDataSource, new RegExp("pgSelect<Record<string, unknown>>\\(cfg, \\\"" + table + "\\\""));
  assert.match(webDataSource, new RegExp(writerMethod + ": async"));
  assert.match(webDataSource, new RegExp(hydrateKey + ": \\("));
  assert.match(remoteWrite, new RegExp("import type \\{[\\s\\S]*" + typeName));
}

assert.match(
  syncAdapter,
  /"warehouses", "warehouse_locations", "warehouse_stock", "warehouse_transfers"/
);
assert.match(
  webDataSource,
  /warehouseStore\.hydrateWarehouseState\(\{[\s\S]*warehouses:[\s\S]*locations:[\s\S]*stock:[\s\S]*transfers:/
);
assert.match(persistence, /warehouse\?: ReturnType<typeof warehouseStore\.exportWarehouseState>/);
assert.match(persistence, /warehouse: warehouseStore\.exportWarehouseState\(\)/);
assert.match(persistence, /if \(snap\.warehouse\) warehouseStore\.hydrateWarehouseState\(snap\.warehouse\)/);

console.log("WMS hybrid wiring contract tests passed");
