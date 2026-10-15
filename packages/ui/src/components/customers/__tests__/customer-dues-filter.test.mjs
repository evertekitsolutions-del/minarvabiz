import assert from "node:assert/strict";
import fs from "node:fs";
import { hasOutstandingCustomerBalance } from "../customer-dues-filter.ts";

const customers = [
  { id: "unpaid", outstandingBalance: 100.5 },
  { id: "settled", outstandingBalance: 0 },
  { id: "credit", outstandingBalance: -5 },
  { id: "corrupt-nan", outstandingBalance: NaN },
  { id: "corrupt-infinite", outstandingBalance: Infinity },
  { id: "fractional", outstandingBalance: 0.01 },
];
assert.deepEqual(customers.filter(hasOutstandingCustomerBalance).map((c) => c.id), ["unpaid", "fractional"]);

const ui = fs.readFileSync(new URL("../CustomerList.tsx", import.meta.url), "utf8");
assert.match(ui, /customers\.filter\(hasOutstandingCustomerBalance\)/);
assert.match(ui, /checked=\{withDuesOnly\}/);
assert.match(ui, /rows=\{visibleCustomers\}/);
assert.match(ui, /setWithDuesOnly\(false\)/);
assert.match(ui, /onSearch\?\.\(""\)/, "Clear filters must restore the parent's unfiltered search");
assert.match(ui, /role="status"/);
console.log("Customers outstanding-only search and filter tests PASS");
