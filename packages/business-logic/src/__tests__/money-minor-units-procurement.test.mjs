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

const utils = require("../../../utils/src/index.ts");

assert.equal(utils.allocateMinorByQuantityRatio(100, 1, 3), 33);
assert.equal(utils.allocateMinorByQuantityRatio(100, 2, 3), 67);
assert.equal(utils.allocateMinorByQuantityRatio(101, 1, 2), 51);
assert.equal(
  utils.fromMinorUnits(utils.addMinorUnits(utils.toMinorUnits(0.1), utils.toMinorUnits(0.2))),
  0.3,
);
assert.equal(
  utils.multiplyMinorByQuantity(utils.toMinorUnits(12.34), 0.125),
  154,
);
assert.equal(utils.percentOfMinor(154, 18), 28);

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8");
const cash = read("../cash-register.ts");
const returnValue = read("../return-value.ts");
const purchaseReturns = read("../purchase-returns.ts");
const procurementAccounting = read("../procurement-accounting.ts");
const procurementStore = read("../procurement-store.ts");
const supplierLedger = read("../supplier-ledger.ts");

for (const source of [cash, returnValue, procurementAccounting, supplierLedger]) {
  assert.doesNotMatch(source, /Math\.round/);
  assert.doesNotMatch(source, /Number\.EPSILON/);
}

assert.match(cash, /cashReceivedMinor/);
assert.match(cash, /subtractMinorUnits/);

assert.match(returnValue, /allocateMinorByQuantityRatio/);
assert.match(returnValue, /addMinorUnits\(toMinorUnits\(sale\.paidAmount\), toMinorUnits\(sale\.balanceAmount\)\)/);

assert.match(procurementAccounting, /multiplyMinorByQuantity/);
assert.match(procurementAccounting, /percentOfMinor/);
assert.match(procurementAccounting, /addMinorUnits/);

assert.doesNotMatch(procurementStore, /function r2/);
assert.match(procurementStore, /multiplyMinorByQuantity/);
assert.match(procurementStore, /percentOfMinor/);
assert.match(procurementStore, /subtotalMinor/);
assert.match(procurementStore, /taxMinor/);

assert.doesNotMatch(purchaseReturns, /Math\.round\(input\.amount \* 100\)/);
assert.match(purchaseReturns, /subtractMinorUnits/);

assert.match(supplierLedger, /totalPurchasesMinor/);
assert.match(supplierLedger, /totalPaidMinor/);
assert.match(supplierLedger, /totalReturnsMinor/);

console.log("Procurement/returns/cash minor-unit arithmetic tests passed");
