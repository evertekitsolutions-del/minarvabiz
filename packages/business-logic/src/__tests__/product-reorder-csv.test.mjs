import assert from "node:assert/strict";
import { exportReorderCsv } from "../reorder-csv.ts";
const rows = [
  { name: 'Cotton, Grade "A"', sku: "COT-1", stockQuantity: 2.5, minimumStock: 5.25, unit: "m" },
  { name: "=HYPERLINK(\"https://malicious.invalid\")", sku: "@SKU", stockQuantity: 0, minimumStock: 1, unit: "pcs" },
  { name: "At threshold", sku: "T-1", stockQuantity: 5, minimumStock: 5, unit: "pcs" },
  { name: "Healthy stock", sku: "OK-1", stockQuantity: 20, minimumStock: 5, unit: "pcs" },
];
const csv = exportReorderCsv(rows);
assert.equal(csv.split("\n").length, 5, "header plus 3 low-stock rows and trailing newline");
assert.match(csv, /^name,sku,on_hand,min_stock,shortfall,unit\n/);
assert.match(csv, /"Cotton, Grade ""A""",COT-1,2\.5,5\.25,2\.75,m/);
assert.match(csv, /At threshold,T-1,5,5,0,pcs/);
assert.doesNotMatch(csv, /Healthy stock/);
assert.ok(csv.includes("\'=HYPERLINK"), "formula names must be inert in spreadsheet applications");
assert.ok(csv.includes("\'@SKU"), "formula-like SKUs must be inert");
assert.equal(exportReorderCsv([]), "name,sku,on_hand,min_stock,shortfall,unit\n");
console.log("Low stock reorder CSV functional tests PASS");
