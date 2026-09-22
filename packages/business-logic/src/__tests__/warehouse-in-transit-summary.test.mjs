import assert from "node:assert/strict";
import fs from "node:fs";

const warehouse = fs.readFileSync(new URL("../warehouse-store.ts", import.meta.url), "utf8");
const panel = fs.readFileSync(new URL("../../../ui/src/components/inventory/WarehousePanel.tsx", import.meta.url), "utf8");

const start = warehouse.indexOf("export function warehouseStockSummary");
const end = warehouse.indexOf("export function hydrateWarehouseState", start);
assert.ok(start >= 0 && end > start, "warehouseStockSummary must exist");
const summary = warehouse.slice(start, end);

assert.match(summary, /const inTransitByProduct = new Map<string, number>/);
assert.match(summary, /transfer\.status !== "in_transit"/);
assert.match(summary, /const inTransit = roundQty\(inTransitByProduct\.get\(productId\) \?\? 0\)/);
assert.match(summary, /unallocated: roundQty\(Math\.max\(0, total - allocated - inTransit\)\)/);
assert.match(panel, />In transit<\/th>/);
assert.match(panel, /qty\(row\.inTransit\)/);

console.log("WMS in-transit summary contract tests passed");
