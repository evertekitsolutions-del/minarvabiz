import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, file
);

const orders = require("../orders-store.ts");
const store = require("../store.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const remote = require("../remote-write.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);
const chart = structuredClone(accounting.exportAccountingState().accounts);

function reset() {
  accounting.hydrateAccountingState({ accounts: structuredClone(chart), journals: [], journalSequence: 0 });
  store.hydrateCore({
    customers: [{ id: "free-c", name: "Free Order Customer", outstandingBalance: 0,
      totalSpending: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01" }],
    products: [], sales: [], payments: [],
  });
  orders.hydrateOrders({ orders: [], measurements: [] });
  outbox.hydrateOutbox([]);
}
function snap() {
  return JSON.stringify({
    order: orders.listOrders(), customer: store.getCustomer("free-c"),
    payments: store.listPayments(), accounting: accounting.exportAccountingState(),
    outbox: outbox.exportOutbox(),
  });
}

test("zero-charge service order cancels without inventing a journal or refund", () => {
  reset();
  const created = orders.createOrder({
    customerId: "free-c", serviceType: "ladies_tailoring", price: 0, advance: 0,
  });
  assert.deepEqual(created.errors, []);
  assert.ok(created.order);
  assert.equal(accounting.listJournalEntries().length, 0);
  const result = orders.updateOrderStatus(created.order.id, "cancelled", {
    reason: "Order was not required",
  });
  assert.equal(result.error, undefined);
  assert.equal(result.order?.status, "cancelled");
  assert.equal(accounting.listJournalEntries().length, 0);
  assert.equal(store.listPayments().length, 0);
  assert.equal(store.getCustomer("free-c").outstandingBalance, 0);
  assert.equal(store.getCustomer("free-c").totalSpending, 0);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
  assert.ok(outbox.listPendingOutbox().some(event => event.aggregateType === "orders" &&
    event.aggregateId === created.order.id && event.operation === "update"));
  const beforeRetry = snap();
  const repeat = orders.updateOrderStatus(created.order.id, "cancelled", {
    reason: "Repeated cancellation",
  });
  assert.equal(repeat.order, null);
  assert.equal(snap(), beforeRetry);
});

test("legacy zero-charge order with no opening journal may be cancelled", () => {
  reset();
  orders.hydrateOrders({ orders: [{
    id: "free-legacy", orderNumber: "ORD-FREE-OLD", customerId: "free-c",
    customerName: "Free Order Customer", orderDate: "2026-01-01",
    serviceType: "ladies_tailoring", status: "pending", price: 0, discount: 0,
    advance: 0, balance: 0, externalMaterialCost: 0, orderExpensesTotal: 0,
    quantity: 1, unitPrice: 0, bulkDiscount: 0, tshirt: null, expenses: [],
    createdAt: "2026-01-01", updatedAt: "2026-01-01", version: 1,
  }], measurements: [] });
  const result = orders.updateOrderStatus("free-legacy", "cancelled", { reason: "No longer needed" });
  assert.equal(result.error, undefined);
  assert.equal(result.order?.status, "cancelled");
  assert.equal(accounting.listJournalEntries().length, 0);
});

test("priced order missing its original posting stays blocked", () => {
  reset();
  orders.hydrateOrders({ orders: [{
    id: "charged-legacy", orderNumber: "ORD-CHARGED", customerId: "free-c",
    customerName: "Free Order Customer", orderDate: "2026-01-01",
    serviceType: "ladies_tailoring", status: "pending", price: 25, discount: 0,
    advance: 0, balance: 25, externalMaterialCost: 0, orderExpensesTotal: 0,
    quantity: 1, unitPrice: 25, bulkDiscount: 0, tshirt: null, expenses: [],
    createdAt: "2026-01-01", updatedAt: "2026-01-01", version: 1,
  }], measurements: [] });
  store.getCustomer("free-c").outstandingBalance = 25;
  const before = snap();
  const result = orders.updateOrderStatus("charged-legacy", "cancelled", { reason: "Customer request" });
  assert.equal(result.order, null);
  assert.match(result.error, /accounting reconciliation/i);
  assert.equal(snap(), before);
});

test("a zero-charge order cannot hide an unexpected posted journal", () => {
  reset();
  const created = orders.createOrder({ customerId: "free-c", serviceType: "ladies_tailoring", price: 25 });
  assert.ok(created.order);
  created.order.price = 0;
  created.order.balance = 0;
  created.order.advance = 0;
  const before = snap();
  const result = orders.updateOrderStatus(created.order.id, "cancelled", { reason: "Customer request" });
  assert.equal(result.order, null);
  assert.match(result.error, /unexpected accounting posting/i);
  assert.equal(snap(), before);
});
