import assert from "node:assert/strict";
import fs from "node:fs";
import { isUnpaidSale } from "../unpaid-sale-filter.ts";

const valid = (status, balanceAmount) => ({ status, balanceAmount });
assert.equal(isUnpaidSale(valid("partial", 100)), true);
assert.equal(isUnpaidSale(valid("completed", 0.01)), true);
for (const row of [
  valid("completed", 0),
  valid("partial", -1),
  valid("returned", 150),
  valid("cancelled", 150),
  valid("draft", 150),
  valid("completed", NaN),
  valid("partial", Infinity),
  valid("completed", Number.MAX_VALUE),
]) assert.equal(isUnpaidSale(row), false, JSON.stringify(row));

const ui = fs.readFileSync(new URL("../SalesList.tsx", import.meta.url), "utf8");
assert.match(ui, /unpaidOnly && !isUnpaidSale\(sale\)/);
assert.match(ui, /\[sales, customerId, status, unpaidOnly, dateFrom, dateTo, query\]/);
assert.match(ui, /checked=\{unpaidOnly\}/);
assert.match(ui, /setUnpaidOnly\(false\)/);
assert.match(ui, /rows=\{filteredSales\}/);
assert.match(ui, /exportSalesHistoryCsv\(filteredSales\)/);
console.log("Sales unpaid-only filtering and filtered CSV interaction tests PASS");
