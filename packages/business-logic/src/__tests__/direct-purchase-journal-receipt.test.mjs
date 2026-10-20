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
  }).outputText,
  file,
);
const supplierStore = require("../phase5-store.ts");
const ordersStore = require("../orders-store.ts");
const accounting = require("../accounting-store.ts");
const posting = require("../procurement-accounting.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const remote = require("../remote-write.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);
const initialAccounts = structuredClone(accounting.exportAccountingState().accounts);

function reset() {
  accounting.hydrateAccountingState({ accounts: structuredClone(initialAccounts), journals: [], journalSequence: 0 });
  supplierStore.hydratePhase5({
    suppliers: [{ id: "supplier-1", name: "Accounting Supplier", outstandingBalance: 0, openingBalance: 0 }],
    purchases: [], expenses: [], laundryOrders: [], expenseCategories: [],
  });
  ordersStore.hydrateOrders({ orders: [
    { id: "order-1", orderNumber: "ORD-1", expenses: [], orderExpensesTotal: 0, version: 1 },
  ] });
  outbox.hydrateOutbox([]);
}

function attempt() {
  return supplierStore.createPurchase({
    supplierId: "supplier-1", amount: 75.25, paidAmount: 15.25,
    paymentMethod: "cash", description: "Order-specific fabric", date: "2026-09-20",
    kind: "order_specific", orderId: "order-1",
  });
}

const snapshot = () => JSON.stringify({
  suppliers: supplierStore.listSuppliers(),
  purchases: supplierStore.listPurchases(),
  order: ordersStore.getOrder("order-1"),
  accounting: accounting.exportAccountingState(),
  outbox: outbox.exportOutbox(),
});

test("null purchase journal receipt leaves master, order expense and outbox intact", () => {
  reset();
  const before = snapshot();
  const original = posting.planDirectPurchasePosting;
  try {
    posting.planDirectPurchasePosting = () => ({ errors: [], commit: () => null });
    const result = attempt();
    assert.equal(result.purchase, null);
    assert.match(result.errors.join(" "), /journal was not committed/);
    assert.equal(snapshot(), before, "null commit must not create purchase or payable");
  } finally {
    posting.planDirectPurchasePosting = original;
  }
});

test("throwing purchase journal commit must not create customer-facing purchase", () => {
  reset();
  const before = snapshot();
  const original = posting.planDirectPurchasePosting;
  try {
    posting.planDirectPurchasePosting = () => ({
      errors: [],
      commit: () => { throw new Error("accounting storage unavailable"); },
    });
    assert.throws(attempt, /accounting storage unavailable/);
    assert.equal(snapshot(), before, "failed journal cannot change supplier, order or queue");
  } finally {
    posting.planDirectPurchasePosting = original;
  }
});

test("successful direct purchase continues balancing ledger, supplier payable and order costs", () => {
  reset();
  const result = attempt();
  assert.deepEqual(result.errors, []);
  assert.ok(result.purchase?.id);
  assert.equal(result.purchase.amount, 75.25);
  assert.equal(supplierStore.getSupplier("supplier-1").outstandingBalance, 60);
  assert.equal(ordersStore.getOrder("order-1").orderExpensesTotal, 75.25);
  assert.equal(supplierStore.listPurchases().length, 1);
  assert.equal(accounting.listJournalEntries().length, 1);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});
