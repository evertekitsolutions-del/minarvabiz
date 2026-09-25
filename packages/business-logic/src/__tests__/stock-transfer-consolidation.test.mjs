import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const storeSource = fs.readFileSync(new URL("../store.ts", import.meta.url), "utf8");
const inventoryPage = fs.readFileSync(
  new URL("../../../../apps/web/src/app/(app)/inventory/page.tsx", import.meta.url),
  "utf8"
);
const warehousePanel = fs.readFileSync(
  new URL("../../../ui/src/components/inventory/WarehousePanel.tsx", import.meta.url),
  "utf8"
);

const start = storeSource.indexOf("export function transferStock");
const end = storeSource.indexOf("export function listHeldSales", start);
assert.ok(start >= 0 && end > start, "legacy transfer compatibility block must exist");
const legacyTransfer = storeSource.slice(start, end);

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

// Runtime regression: execute the compatibility API so changed-code coverage
// proves it fails closed and cannot mutate either product's stock.
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename
  );

const runtimeStore = require("../store.ts");
const permissions = require("../permissions.ts");
permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
runtimeStore.hydrateCore({
  products: [
    { id: "src", name: "Fabric", sku: "FAB-1", stockQuantity: 10, costPrice: 1, sellingPrice: 2, minimumStock: 0, isActive: true, version: 1 },
    { id: "dst", name: "Fabric", sku: "FAB-1", stockQuantity: 2, costPrice: 1, sellingPrice: 2, minimumStock: 0, isActive: true, version: 1 },
  ],
});
const beforeSource = runtimeStore.getProduct("src").stockQuantity;
const beforeDestination = runtimeStore.getProduct("dst").stockQuantity;
const blocked = runtimeStore.transferStock({
  sourceProductId: "src",
  destinationProductId: "dst",
  quantity: 3,
  notes: "must be blocked",
});
assert.equal(blocked.transfer, null);
assert.match(blocked.errors.join(" "), /disabled.*Warehouse Management/i);
assert.equal(runtimeStore.getProduct("src").stockQuantity, beforeSource);
assert.equal(runtimeStore.getProduct("dst").stockQuantity, beforeDestination);

console.log("Stock transfer consolidation contract tests passed");
