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
      id: "create-journal-c", name: "Create Test Customer",
      outstandingBalance: 0, totalSpending: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01",
    }],
    products: [], sales: [], payments: [],
  });
  orders.hydrateOrders({ orders: [], measurements: [] });
  outbox.hydrateOutbox([]);
}
function snapshot() {
  return JSON.stringify({
    order: orders.listOrders(), customer: customers.getCustomer("create-journal-c"),
    payments: customers.listPayments(), accounting: accounting.exportAccountingState(),
    outbox: outbox.exportOutbox(),
  });
}
const create = (price, advance = 0) => orders.createOrder({
  customerId: "create-journal-c", serviceType: "ladies_tailoring",
  price, advance, advancePaymentMethod: "cash",
});
function withPosting(stub, fn) {
  const original = serviceAccounting.planServiceOrderPosting;
  try {
    serviceAccounting.planServiceOrderPosting = stub;
    return fn();
  } finally {
    serviceAccounting.planServiceOrderPosting = original;
  }
}

test("null service-order journal cannot create unpaid order or customer debt", () => {
  reset();
  const before = snapshot();
  withPosting(() => ({ errors: [], commit: () => null }), () => {
    const result = create(100.25);
    assert.equal(result.order, null);
    assert.match(result.errors.join(" "), /accounting journal was not committed/i);
    assert.equal(snapshot(), before);
  });
});

test("null service-order journal cannot create advance payment or alter customer totals", () => {
  reset();
  const before = snapshot();
  withPosting(() => ({ errors: [], commit: () => null }), () => {
    const result = create(100.25, 25.25);
    assert.equal(result.order, null);
    assert.match(result.errors.join(" "), /accounting journal was not committed/i);
    assert.equal(snapshot(), before);
    assert.equal(customers.listPayments().length, 0);
  });
});

test("throwing journal commit leaves order, customer and outbox untouched", () => {
  reset();
  const before = snapshot();
  withPosting(() => ({ errors: [], commit: () => { throw Error("journal storage failed"); } }), () => {
    assert.throws(() => create(100.25, 25.25), /journal storage failed/);
    assert.equal(snapshot(), before);
  });
});

test("existing paid order creation keeps a balanced journal and exact advance", () => {
  reset();
  const result = create(100.25, 25.25);
  assert.deepEqual(result.errors, []);
  assert.ok(result.order);
  assert.equal(customers.getCustomer("create-journal-c").outstandingBalance, 75);
  assert.equal(customers.getCustomer("create-journal-c").totalSpending, 25.25);
  assert.equal(customers.listPayments().filter(p => p.referenceType === "order").length, 1);
  assert.equal(accounting.listJournalEntries().filter(
    j => j.referenceType === "auto_service_order" && j.referenceId === result.order.id
  ).length, 1);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});

test("zero-charge order continues to work without an accounting journal", () => {
  reset();
  const result = create(0);
  assert.deepEqual(result.errors, []);
  assert.ok(result.order);
  assert.equal(result.order.price, 0);
  assert.equal(accounting.listJournalEntries().length, 0);
  assert.equal(customers.getCustomer("create-journal-c").outstandingBalance, 0);
});
