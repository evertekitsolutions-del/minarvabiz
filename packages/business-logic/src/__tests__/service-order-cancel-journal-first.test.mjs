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
const customers = require("../store.ts");
const accounting = require("../accounting-store.ts");
const serviceAccounting = require("../service-order-accounting.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const remote = require("../remote-write.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);
const chart = structuredClone(accounting.exportAccountingState().accounts);

function reset() {
  accounting.hydrateAccountingState({ accounts: structuredClone(chart), journals: [], journalSequence: 0 });
  customers.hydrateCore({
    customers: [{
      id: "cancel-journal-c", name: "Journal Test Customer",
      outstandingBalance: 0, totalSpending: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01",
    }],
    products: [], sales: [], payments: [],
  });
  orders.hydrateOrders({ orders: [], measurements: [] });
  outbox.hydrateOutbox([]);
}

function create(advance) {
  const result = orders.createOrder({
    customerId: "cancel-journal-c", serviceType: "ladies_tailoring",
    price: 100.25, advance, advancePaymentMethod: "bank",
  });
  assert.deepEqual(result.errors, []);
  assert.ok(result.order);
  return result.order;
}

function snapshot() {
  return JSON.stringify({
    order: orders.listOrders(), customer: customers.getCustomer("cancel-journal-c"),
    payments: customers.listPayments(), accounting: accounting.exportAccountingState(),
    outbox: outbox.exportOutbox(),
  });
}

test("null reversal journal leaves unpaid service order and customer receivable unchanged", () => {
  reset();
  const order = create(0);
  const before = snapshot();
  const original = serviceAccounting.planServiceOrderCancellation;
  try {
    serviceAccounting.planServiceOrderCancellation = () => ({ errors: [], commit: () => null });
    const result = orders.updateOrderStatus(order.id, "cancelled", { reason: "Customer requested cancellation" });
    assert.equal(result.order, null);
    assert.match(result.error, /cancellation journal was not committed/i);
    assert.equal(snapshot(), before);
  } finally {
    serviceAccounting.planServiceOrderCancellation = original;
  }
});

test("null reversal journal does not issue a paid-advance refund or alter balances", () => {
  reset();
  const order = create(25.25);
  const before = snapshot();
  const original = serviceAccounting.planServiceOrderCancellation;
  try {
    serviceAccounting.planServiceOrderCancellation = () => ({ errors: [], commit: () => null });
    const result = orders.updateOrderStatus(order.id, "cancelled", {
      reason: "Customer requested cancellation", refundPaymentMethod: "bank",
    });
    assert.equal(result.order, null);
    assert.match(result.error, /cancellation journal was not committed/i);
    assert.equal(snapshot(), before);
    assert.equal(customers.listPayments().filter(p => p.referenceType === "refund").length, 0);
  } finally {
    serviceAccounting.planServiceOrderCancellation = original;
  }
});

test("thrown reversal journal cannot mutate order, receivable or outbox", () => {
  reset();
  const order = create(25.25);
  const before = snapshot();
  const original = serviceAccounting.planServiceOrderCancellation;
  try {
    serviceAccounting.planServiceOrderCancellation = () => ({
      errors: [], commit: () => { throw Error("journal unavailable"); },
    });
    assert.throws(() => orders.updateOrderStatus(order.id, "cancelled", {
      reason: "Customer requested cancellation", refundPaymentMethod: "bank",
    }), /journal unavailable/);
    assert.equal(snapshot(), before);
  } finally {
    serviceAccounting.planServiceOrderCancellation = original;
  }
});

test("successful cancellation still posts balanced journal and correct refund", () => {
  reset();
  const order = create(25.25);
  const result = orders.updateOrderStatus(order.id, "cancelled", {
    reason: "Customer requested cancellation", refundPaymentMethod: "bank",
  });
  assert.equal(result.error, undefined);
  assert.equal(result.order?.status, "cancelled");
  assert.equal(customers.getCustomer("cancel-journal-c").outstandingBalance, 0);
  assert.equal(customers.getCustomer("cancel-journal-c").totalSpending, 0);
  const refunds = customers.listPayments().filter(p => p.referenceType === "refund" && p.referenceId === order.id);
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].amount, 25.25);
  const reversals = accounting.listJournalEntries().filter(
    j => j.referenceId === order.id && j.referenceType === "auto_service_order_cancel"
  );
  assert.equal(reversals.length, 1);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});
