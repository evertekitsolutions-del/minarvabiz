import assert from "node:assert/strict";
import fs from "node:fs";

const store = fs.readFileSync(new URL("../store.ts", import.meta.url), "utf8");
const inventoryPage = fs.readFileSync(
  new URL("../../../../apps/web/src/app/(app)/inventory/page.tsx", import.meta.url),
  "utf8"
);
const warehousePanel = fs.readFileSync(
  new URL("../../../ui/src/components/inventory/WarehousePanel.tsx", import.meta.url),
  "utf8"
);

const start = store.indexOf("export function transferStock");
const end = store.indexOf("export function listHeldSales", start);
assert.ok(start >= 0 && end > start, "legacy transfer compatibility block must exist");
const legacyTransfer = store.slice(start, end);

assert.match(legacyTransfer, /Direct product-to-product stock transfer is disabled/);
assert.doesNotMatch(legacyTransfer, /source\.stockQuantity\s*=/);
assert.doesNotMatch(legacyTransfer, /destination\.stockQuantity\s*=/);
assert.doesNotMatch(inventoryPage, /<option value="transfer">/);
assert.match(inventoryPage, /router\.push\("\/warehouse"\)/);
assert.match(inventoryPage, /Controlled Stock Transfer/);

assert.match(warehousePanel, /Create transfer request/);
assert.match(warehousePanel, /approval required before dispatch/);
assert.match(warehousePanel, /approveWarehouseTransfer/);
assert.match(warehousePanel, /dispatchWarehouseTransfer/);
assert.match(warehousePanel, /receiveWarehouseTransfer/);

console.log("Stock transfer consolidation contract tests passed");
