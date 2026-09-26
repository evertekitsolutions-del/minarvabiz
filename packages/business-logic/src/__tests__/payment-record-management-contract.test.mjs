import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const ui = read("packages/ui/src/components/payments/PaymentsPanel.tsx");
const web = read("apps/web/src/app/(app)/payments/page.tsx");
const offline = read("packages/ui/src/components/desktop/OfflineModulesPanel.tsx");
const store = read("packages/business-logic/src/store.ts");

for (const token of [
  "Payment history",
  "Search counterparty, reference, allocation or source",
  "All counterparties",
  "All sources",
  "All methods",
  "Inflow + outflow",
  "Payment traceability",
  "Reference ID",
  "Payment ID",
  "Reference / allocation notes",
  "Supplier payment",
  "Customer collection",
]) assert.equal(ui.includes(token), true, `Missing professional payment control: ${token}`);

assert.equal(ui.includes("filteredPayments"), true);
assert.equal(ui.includes("counterpartyName"), true);
assert.equal(ui.includes("paymentDirection"), true);
assert.equal(ui.includes("detailPayment"), true);

assert.equal(web.includes("customers={customers}"), true);
assert.equal(web.includes("suppliers={suppliers}"), true);
assert.equal(web.includes("phase5Store.listSuppliers()"), true);

assert.equal(offline.includes("payments={store.listPayments()}"), true);
assert.equal(offline.includes('referenceType !== "supplier"'), false);
assert.equal(offline.includes("customers={store.listCustomers()}"), true);
assert.equal(offline.includes("suppliers={phase5Store.listSuppliers()}"), true);

for (const token of [
  "recordCustomerPayment",
  "recordSupplierPaymentEntry",
  "recordRefundPayment",
  "referenceType",
  "referenceId",
  "Invoice ",
  "Service order ",
]) assert.equal(store.includes(token), true, `Missing payment core traceability: ${token}`);

console.log("Payment record management contract PASS");
