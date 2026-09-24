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
const billing = require("../../../billing/src/index.ts");
const sales = require("../sales.ts");

assert.equal(utils.toMinorUnits(0.1 + 0.2), 30);
assert.equal(utils.toMinorUnits(1.005), 101);
assert.equal(utils.toMinorUnits(-1.005), -101);
assert.equal(utils.fromMinorUnits(utils.addMinorUnits(10, 20)), 0.3);
assert.equal(utils.formatMinorUnits(5), "0.05");
assert.equal(utils.formatMinorUnits(-5), "-0.05");
assert.equal(utils.multiplyMinorByQuantity(utils.toMinorUnits(12.34), 0.125), 154);
assert.equal(utils.percentOfMinor(utils.toMinorUnits(99.99), 18), 1800);

const line = billing.calculateLineItem({
  quantity: 3,
  unitPrice: 0.1,
  discountPercent: 10,
  taxRate: 18,
});
assert.deepEqual(line, {
  subtotal: 0.3,
  discountAmount: 0.03,
  taxableAmount: 0.27,
  taxAmount: 0.05,
  total: 0.32,
});

const invoice = billing.calculateInvoiceTotals({
  items: [
    { quantity: 1, unitPrice: 0.1 },
    { quantity: 1, unitPrice: 0.2 },
  ],
});
assert.equal(invoice.itemsSubtotal, 0.3);
assert.equal(invoice.grandTotal, 0.3);

const tender = sales.validateTender(0.3, [
  { method: "cash", amount: 0.1 },
  { method: "upi", amount: 0.2 },
]);
assert.equal(tender.tendered, 0.3);
assert.equal(tender.collectible, 0.3);
assert.equal(tender.balanceDue, 0);
assert.equal(tender.changeDue, 0);
assert.deepEqual(tender.errors, []);

const invalidTender = sales.validateTender(10, [{ method: "cash", amount: Infinity }]);
assert.equal(invalidTender.errors.length, 1);
assert.equal(invalidTender.collectible, 0);

const allocation = sales.allocatePayment(0.3, 0.1 + 0.2);
assert.deepEqual(allocation, {
  total: 0.3,
  paidAmount: 0.3,
  balanceAmount: 0,
  status: "completed",
});

assert.equal(
  sales.saleCostOfGoods([{ quantity: 0.125, costPrice: 12.34 }]),
  1.54,
);

const storeSource = fs.readFileSync(new URL("../store.ts", import.meta.url), "utf8");
const createSaleSource = storeSource.slice(
  storeSource.indexOf("export function createSale"),
  storeSource.indexOf("export function listPayments")
);
assert.match(createSaleSource, /toMinorUnits\(totals\.grandTotal\)/);
assert.match(createSaleSource, /paymentRemainingMinor/);
assert.doesNotMatch(createSaleSource, /round2\(/);
assert.doesNotMatch(createSaleSource, /toFixed\(/);

const collectionSource = storeSource.slice(
  storeSource.indexOf("export function recordCustomerPayment"),
  storeSource.indexOf("export function recordRefundPayment")
);
assert.match(collectionSource, /remainingMinor/);
assert.match(collectionSource, /addMinorUnits\(salePaidMinor, saleBalanceMinor\) !== saleTotalMinor/);
assert.doesNotMatch(collectionSource, /round2\(/);
assert.doesNotMatch(collectionSource, /toFixed\(/);

const billingSource = fs.readFileSync(new URL("../../../billing/src/index.ts", import.meta.url), "utf8");
assert.match(billingSource, /multiplyMinorByQuantity/);
assert.match(billingSource, /percentOfMinor/);
assert.doesNotMatch(billingSource, /quantity \* item\.unitPrice/);

const ledgerSource = fs.readFileSync(new URL("../customer-ledger.ts", import.meta.url), "utf8");
assert.doesNotMatch(ledgerSource, /Math\.round/);
assert.doesNotMatch(ledgerSource, /Number\.EPSILON/);

console.log("Core money minor-unit arithmetic tests passed");
