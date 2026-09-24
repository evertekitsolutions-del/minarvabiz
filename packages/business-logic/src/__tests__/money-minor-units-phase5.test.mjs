import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText,
  filename
);

const laundry = require("../laundry.ts");
const expenses = require("../expenses.ts");

const fractionalLaundry = laundry.calculateLaundryProfit({
  customerRate: 0.1,
  supplierRate: 0.03,
  quantity: 3,
});
assert.deepEqual(fractionalLaundry, {
  customerRate: 0.1,
  supplierRate: 0.03,
  quantity: 3,
  unitProfit: 0.07,
  totalProfit: 0.21,
  totalCustomerCharge: 0.3,
  totalSupplierCost: 0.09,
});

const fractionalQuantityLaundry = laundry.calculateLaundryProfit({
  customerRate: 12.34,
  supplierRate: 10.01,
  quantity: 0.125,
});
assert.equal(fractionalQuantityLaundry.totalCustomerCharge, 1.54);
assert.equal(fractionalQuantityLaundry.totalSupplierCost, 1.25);
assert.equal(fractionalQuantityLaundry.totalProfit, 0.29);

assert.deepEqual(expenses.purchaseBalance(0.3, 0.1 + 0.2), {
  amount: 0.3,
  paidAmount: 0.3,
  balanceAmount: 0,
});
assert.deepEqual(expenses.purchaseBalance(10.01, 0.1 + 0.2), {
  amount: 10.01,
  paidAmount: 0.3,
  balanceAmount: 9.71,
});

const phase5 = fs.readFileSync(new URL("../phase5-store.ts", import.meta.url), "utf8");
for (const banned of [
  /function r2\(/,
  /Number\.EPSILON/,
  /toFixed\(2\)/,
  /Math\.round\([^\n]*\*\s*100\)/,
]) {
  assert.doesNotMatch(phase5, banned);
}

assert.match(phase5, /moneyMinorOrNull/);
assert.match(phase5, /formatMinorUnits/);
assert.match(phase5, /remainingMinor/);
assert.match(phase5, /allocatedCollectionMinor/);
assert.match(phase5, /supplierOutstandingMinor/);
assert.match(phase5, /subtractMinorUnits\(purchaseTotalMinor, nextPaidMinor\)/);
assert.match(phase5, /laundryAllocationMinorFromPayment/);

const laundrySource = fs.readFileSync(new URL("../laundry.ts", import.meta.url), "utf8");
assert.match(laundrySource, /multiplyMinorByQuantity/);
assert.match(laundrySource, /subtractMinorUnits/);
assert.doesNotMatch(laundrySource, /unitProfit \* quantity/);
assert.doesNotMatch(laundrySource, /customerRate \* quantity/);

const expensesSource = fs.readFileSync(new URL("../expenses.ts", import.meta.url), "utf8");
assert.match(expensesSource, /subtractMinorUnits/);
assert.doesNotMatch(expensesSource, /a - p/);

console.log("Phase 5 supplier/laundry/direct-purchase minor-unit tests passed");
