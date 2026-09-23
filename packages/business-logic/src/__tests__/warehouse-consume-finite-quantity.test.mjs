import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../warehouse-store.ts", import.meta.url), "utf8");

const consumeStart = source.indexOf("export function consumeWarehouseStock");
const summaryStart = source.indexOf("export function warehouseStockSummary", consumeStart);
assert.ok(consumeStart >= 0 && summaryStart > consumeStart, "consumeWarehouseStock must exist");

const block = source.slice(consumeStart, summaryStart);
assert.match(block, /!Number\.isFinite\(quantity\) \|\| quantity <= 0/);
assert.match(block, /return \{ allocatedConsumed: 0, unallocatedQuantity: 0 \}/);

const guard = block.indexOf("!Number.isFinite(quantity)");
const remaining = block.indexOf("let remaining = roundQty(quantity)");
const mutation = block.indexOf("position.onHand =");
assert.ok(guard >= 0, "finite guard must exist");
assert.ok(remaining > guard, "finite guard must run before quantity normalization");
assert.ok(mutation > guard, "finite guard must run before stock mutation");

console.log("WMS consume finite-quantity contract tests passed");
