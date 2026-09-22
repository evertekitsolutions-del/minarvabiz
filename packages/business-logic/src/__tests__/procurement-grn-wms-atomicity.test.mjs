import assert from "node:assert/strict";
import fs from "node:fs";

const warehouse = fs.readFileSync(new URL("../warehouse-store.ts", import.meta.url), "utf8");
const procurement = fs.readFileSync(new URL("../procurement-store.ts", import.meta.url), "utf8");

assert.match(warehouse, /export function validateExistingStockAllocation/);
assert.match(warehouse, /const errors = validateExistingStockAllocation\(input\)/);

const start = procurement.indexOf("export function receivePurchaseOrder");
const end = procurement.indexOf("export function listPurchaseInvoices", start);
assert.ok(start >= 0 && end > start, "receivePurchaseOrder block must exist");
const receive = procurement.slice(start, end);

const preflight = receive.indexOf("warehouseStore.validateExistingStockAllocation");
const mutationBoundary = receive.indexOf("const before = cloneOrder(po)");
const receivedMutation = receive.indexOf("poLine.receivedQuantity =");
const stockMutation = receive.indexOf("mainStore.adjustStock");

assert.ok(preflight >= 0, "GRN must preflight WMS allocation");
assert.ok(mutationBoundary > preflight, "WMS preflight must finish before the GRN mutation phase");
assert.ok(receivedMutation > preflight, "PO received quantity must not mutate before WMS preflight");
assert.ok(stockMutation > preflight, "Product stock must not mutate before WMS preflight");
assert.match(receive, /warehouse allocation failed/);
assert.match(receive, /productTotalStock: r3\(\(product\?\.stockQuantity \?\? 0\) \+ quantity\)/);

console.log("Procurement GRN/WMS atomicity contract tests passed");
