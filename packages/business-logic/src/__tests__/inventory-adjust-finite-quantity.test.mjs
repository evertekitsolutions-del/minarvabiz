import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../store.ts", import.meta.url), "utf8");

const adjustStart = source.indexOf("export function adjustStock");
const transferStart = source.indexOf("export function listStockTransfers", adjustStart);
assert.ok(adjustStart >= 0 && transferStart > adjustStart, "adjustStock must exist");

const adjustBlock = source.slice(adjustStart, transferStart);

assert.match(adjustBlock, /assertPermission\("inventory\.adjust"\)/);
assert.match(adjustBlock, /if \(!Number\.isFinite\(quantity\)\) return null/);

const finiteGuard = adjustBlock.indexOf("if (!Number.isFinite(quantity)) return null");
const warehouseConsume = adjustBlock.indexOf("consumeWarehouseStock");
const stockMutation = adjustBlock.indexOf("p.stockQuantity = applyStockMovement");
assert.ok(finiteGuard >= 0, "finite-quantity guard must exist");
assert.ok(warehouseConsume < 0 || finiteGuard < warehouseConsume, "finite guard must run before WMS consumption");
assert.ok(stockMutation > finiteGuard, "finite guard must run before product stock mutation");

console.log("Direct inventory adjustment finite-quantity contract tests passed");
