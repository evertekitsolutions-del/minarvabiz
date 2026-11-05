import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("inventory report distinguishes current catalog-cost estimate from posted accounting assets", () => {
  const ui = fs.readFileSync(new URL("../../../ui/src/components/reports/ReportsPanel.tsx", import.meta.url), "utf8");
  const source = fs.readFileSync(new URL("../phase7-store.ts", import.meta.url), "utf8");
  assert(ui.includes('name:"Inventory — catalog-cost estimate"'));
  assert(ui.includes('headers:["Product","SKU","Stock","Minimum","Estimated catalog cost","Low Stock"]'));
  assert(ui.includes("Inventory — current catalog-cost estimate"));
  assert(ui.includes("This is not the posted accounting inventory asset balance"));
  assert(ui.includes("Mixed-cost receipts, returns, adjustments and cost history"));
  assert(source.includes("value: Math.round(p.stockQuantity * p.costPrice * 100) / 100"));
  assert(!ui.includes("Inventory stock valuation"));
});
