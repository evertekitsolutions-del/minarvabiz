import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, file
);
const main = require("../store.ts");
const tailoring = require("../orders-store.ts");
const laundry = require("../phase5-store.ts");
const ledger = require("../customer-ledger.ts");
const stamp = "2026-11-04T11:00:00.000Z";
const customer = (outstandingBalance) => ({
  id: "c", name: "Combined Customer", outstandingBalance, totalSpending: 35,
  createdAt: stamp, updatedAt: stamp,
});
const sale = {
  id: "sale-1", customerId: "c", invoiceNumber: "INV-1", total: 100, paidAmount: 20,
  balanceAmount: 80, status: "partial", saleDate: stamp, createdAt: stamp, updatedAt: stamp, items: [],
};
const service = {
  id: "svc-1", customerId: "c", orderNumber: "ORD-1", advance: 10, balance: 30,
  price: 40, status: "stitching", orderDate: stamp, createdAt: stamp, updatedAt: stamp,
};
const iron = {
  id: "laundry-1", customerId: "c", orderNumber: "LDY-1", status: "pending",
  totalCustomerCharge: 30, paidAmount: 5, balanceAmount: 25, mode: "in_house_ironing",
  createdAt: stamp, updatedAt: stamp, version: 1,
};
const receipt = (id, referenceType, amount) => ({
  id, referenceType, referenceId: id, customerId: "c", amount, method: "cash",
  paidAt: stamp, createdAt: stamp, version: 1,
});
function reset(balance, status = "partial") {
  main.hydrateCore({
    customers: [customer(balance)], products: [], sales: [{ ...sale, status }],
    payments: [receipt("p-sale", "sale", 20), receipt("p-service", "order", 10), receipt("p-laundry", "laundry", 5)],
  });
  tailoring.hydrateOrders({ orders: [{ ...service }], measurements: [] });
  laundry.hydratePhase5({ suppliers: [], laundryOrders: [{ ...iron }], expenses: [], purchases: [] });
}
reset(135);
let statement = ledger.buildCustomerStatement("c");
assert(statement);
assert.equal(statement.totalSales, 170);
assert.equal(statement.totalPaid, 35);
assert.equal(statement.totalRefund, 0);
assert.equal(statement.outstanding, 135);
assert.equal(statement.reconciliationDifference, 0);
assert.equal(statement.entries.filter(row => row.entryType === "sale").length, 3);
assert.equal(statement.entries.filter(row => row.entryType === "payment").length, 3);
assert.equal(statement.entries.at(-1).balanceAfter, 135);
assert.match(ledger.buildCustomerStatementHtml(statement), /Charges: 170/);
reset(142);
statement = ledger.buildCustomerStatement("c");
assert.equal(statement.reconciliationDifference, 7);
assert.equal(statement.entries.length, 6); // Reporting does not invent balancing journals.
assert.match(ledger.buildCustomerStatementHtml(statement), /Unreconciled historical/);
main.hydrateCore({
  customers: [customer(0)], products: [], sales: [{ ...sale, status: "returned", paidAmount: 100, balanceAmount: 0 }],
  payments: [receipt("sale-paid", "sale", 100), receipt("sale-refund", "refund", 100)],
});
tailoring.hydrateOrders({ orders: [], measurements: [] });
laundry.hydratePhase5({ suppliers: [], laundryOrders: [], expenses: [], purchases: [] });
statement = ledger.buildCustomerStatement("c");
assert(statement);
assert.equal(statement.totalRefund, 100);
assert.equal(statement.reconciliationDifference, 0);
assert.equal(statement.entries.at(-1).balanceAfter, 0);
console.log("Unified customer statement: source charges, exact receipts, refund/reversal, visible drift PASS");
