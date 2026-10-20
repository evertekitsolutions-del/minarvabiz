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
const suppliers = require("../phase5-store.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const remote = require("../remote-write.ts");
permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);
const initialAccounts = structuredClone(accounting.exportAccountingState().accounts);

function reset(orderExpensesTotal = 0) {
  accounting.hydrateAccountingState({
    accounts: structuredClone(initialAccounts), journals: [], journalSequence: 0,
  });
  orders.hydrateOrders({ orders: [
    { id: "o", orderNumber: "ORD-1", expenses: [], orderExpensesTotal, version: 1 },
  ] });
  suppliers.hydratePhase5({
    suppliers: [{ id: "s", name: "Vendor", outstandingBalance: 0, openingBalance: 0 }],
    purchases: [], expenses: [], laundryOrders: [],
    expenseCategories: [{ id: "ec-9", name: "Other", isSystem: true, createdAt: "2026-01-01" }],
  });
  outbox.hydrateOutbox([]);
}
const expense = () => suppliers.createExpense({
  date: "2026-09-20", categoryId: "ec-9", amount: 25.25,
  paymentMethod: "cash", description: "Field labor", orderId: "o",
});
const purchase = () => suppliers.createPurchase({
  date: "2026-09-20", supplierId: "s", description: "Fabric for order",
  amount: 100.50, paidAmount: 20.50, paymentMethod: "cash",
  kind: "order_specific", orderId: "o",
});
const snapshot = () => JSON.stringify({
  expenses: suppliers.listExpenses(),
  purchases: suppliers.listPurchases(),
  supplier: suppliers.getSupplier("s"),
  order: orders.getOrder("o"),
  accounting: accounting.exportAccountingState(),
  outbox: outbox.exportOutbox(),
});

test("linked expense and purchase reject unreconciled order total before any accounting write", () => {
  for (const amount of [NaN, -1, 1.005, 90071992547410]) {
    for (const [name, create] of [["expense", expense], ["purchase", purchase]]) {
      reset(amount);
      const before = snapshot();
      const result = create();
      assert.equal(result[name], null, name + " " + amount);
      assert.match(result.errors.join(" "), /reconciliation/i);
      assert.equal(snapshot(), before, name + " must not create source, journal or outbox");
    }
  }
});
test("overflow in combined order costs stops purchase and expense before posting", () => {
  for (const [name, create] of [["expense", expense], ["purchase", purchase]]) {
    reset(90071992547409.80);
    const before = snapshot();
    const result = create();
    assert.equal(result[name], null);
    assert.match(result.errors.join(" "), /reconciliation/i);
    assert.equal(snapshot(), before);
  }
});
test("valid cost preflight is read-only and preserves precise balancing source journals", () => {
  reset();
  const before = snapshot();
  const checked = orders.preflightOrderExpenseAddition("o", 25.25);
  assert.ok(checked.order);
  assert.equal(checked.nextCents, 2525);
  assert.equal(snapshot(), before);

  const cost = expense();
  assert.deepEqual(cost.errors, []);
  assert.ok(cost.expense);
  const materials = purchase();
  assert.deepEqual(materials.errors, []);
  assert.ok(materials.purchase);
  assert.equal(orders.getOrder("o").orderExpensesTotal, 125.75);
  assert.equal(suppliers.getSupplier("s").outstandingBalance, 80);
  assert.equal(accounting.listJournalEntries().length, 2);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
  assert.equal(orders.getOrder("o").expenses.length, 2);
});
test("preflight rejects duplicate source identifiers before changing linked order", () => {
  reset();
  assert.ok(orders.addOrderExpense("o", "Initial", 1, "source-1").order);
  const before = snapshot();
  const checked = orders.preflightOrderExpenseAddition("o", 1, "source-1");
  assert.equal(checked.order, null);
  assert.match(checked.error, /source already exists/i);
  assert.equal(snapshot(), before);
});
