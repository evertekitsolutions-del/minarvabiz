import assert from "node:assert/strict";
import fs from "node:fs";
import { hasPayableSupplierBalance } from "../supplier-payables-filter.ts";

const suppliers = [
  { id: "due", outstandingBalance: 125.5 },
  { id: "due-small", outstandingBalance: 0.01 },
  { id: "zero", outstandingBalance: 0 },
  { id: "credit", outstandingBalance: -30 },
  { id: "nan", outstandingBalance: NaN },
  { id: "infinite", outstandingBalance: Infinity },
  { id: "overflow", outstandingBalance: 2 ** 53 },
];
assert.deepEqual(
  suppliers.filter(hasPayableSupplierBalance).map((row) => row.id),
  ["due", "due-small"],
);

const ui = fs.readFileSync(new URL("../SupplierList.tsx", import.meta.url), "utf8");
assert.match(ui, /suppliers\.filter\(hasPayableSupplierBalance\)/);
assert.match(ui, /checked=\{withPayablesOnly\}/);
assert.match(ui, /rows=\{visibleSuppliers\}/);
assert.match(ui, /disabled=\{!hasPayableSupplierBalance\(r\)\}/, "invalid payables must never enable payment");
assert.match(ui, /setWithPayablesOnly\(false\)/, "clear filters resets dues-only filter");
assert.match(ui, /onSearch\?\.\(""\)/, "clear filters resets the parent search");
assert.match(ui, /role="status"/);
console.log("Supplier payable filter, payment action guard and clear-search regression PASS");
