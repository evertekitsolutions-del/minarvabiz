import assert from "node:assert/strict";
import fs from "node:fs";

const warehouse = fs.readFileSync(new URL("../warehouse-store.ts", import.meta.url), "utf8");

const start = warehouse.indexOf("export function createWarehouseTransfer");
const end = warehouse.indexOf("function updateTransfer", start);
assert.ok(start >= 0 && end > start, "createWarehouseTransfer must exist");
const createTransfer = warehouse.slice(start, end);

assert.match(
  createTransfer,
  /if \(!Number\.isFinite\(qty\) \|\| qty <= 0\) errors\.push\("Quantity must be a finite number greater than zero"\)/
);
assert.ok(
  createTransfer.indexOf("!Number.isFinite(qty)") < createTransfer.indexOf("const sourcePosition"),
  "finite quantity validation must run before source-stock validation and mutation"
);

console.log("WMS transfer finite-quantity contract tests passed");
