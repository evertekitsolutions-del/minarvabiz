import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(
  ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, path,
);
const orders = require("../orders-store.ts");
const store = require("../store.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const ledger = require("../customer-ledger.ts");
const permissions = require("../permissions.ts");
const chart = accounting.exportAccountingState().accounts;

function reset() {
  permissions.setCurrentRole("admin");
  permissions.setRuntimeFeaturePolicy(null);
  accounting.hydrateAccountingState({ accounts: chart, journals: [], journalSequence: 0 });
  store.hydrateCore({
    customers: [{
      id: "c", name: "Service Due Customer", outstandingBalance: 0, totalSpending: 0,
      createdAt: "2026-11-05", updatedAt: "2026-11-05",
    }],
    products: [], sales: [], payments: [],
  });
  orders.hydrateOrders({ orders: [], measurements: [] });
  outbox.hydrateOutbox([]);
}
function create(price) {
  const result = orders.createOrder({
    customerId: "c", serviceType: "ladies_tailoring", price,
    advance: 0, advancePaymentMethod: "cash",
  });
  assert.deepEqual(result.errors, []);
  assert(result.order);
  return result.order;
}
function snapshot() {
  return JSON.stringify({
    orders: orders.listOrders(), customer: store.getCustomer("c"),
    payments: store.listPayments(), journals: accounting.listJournalEntries(),
    outbox: outbox.listPendingOutbox(),
  });
}
test("direct service-order collection skips older orders, records source on receipt and posts exact journal", () => {
  reset();
  const first = create(120), selected = create(80);
  const beforeJournals = accounting.listJournalEntries().length;
  const result = store.recordCustomerPayment({
    customerId: "c", amount: 30, method: "upi",
    target: { sourceType: "service_order", id: selected.id },
  });
  assert.deepEqual(result.errors, []);
  assert(result.payment?.id);
  assert.equal(result.payment?.amount, 30);
  assert.equal(result.payment?.method, "upi");
  assert.match(result.payment?.notes ?? "", new RegExp("Service orders: .*" + selected.orderNumber));
  assert.equal(orders.getOrder(first.id)?.balance, 120);
  assert.equal(orders.getOrder(selected.id)?.advance, 30);
  assert.equal(orders.getOrder(selected.id)?.balance, 50);
  assert.equal(store.getCustomer("c")?.outstandingBalance, 170);
  assert.equal(accounting.listJournalEntries().length, beforeJournals + 1);
  assert(accounting.buildBalanceSheet().balanced);
  assert(outbox.listPendingOutbox().some(e => e.aggregateType === "orders" && e.aggregateId === selected.id));
  assert.equal(ledger.buildCustomerStatement("c")?.reconciliationDifference, 0);
});
test("targeted service payment fails without mutating ledger, journals, stock or unrelated order", () => {
  reset();
  const first = create(120), selected = create(80);
  const before = snapshot();
  for (const target of [
    { sourceType: "service_order", id: selected.id, amount: 81 },
    { sourceType: "service_order", id: "missing", amount: 10 },
    { sourceType: "laundry", id: selected.id, amount: 10 },
  ]) {
    const result = store.recordCustomerPayment({
      customerId: "c", amount: target.amount, method: "cash",
      target: { sourceType: target.sourceType, id: target.id },
    });
    assert.equal(result.payment, null);
    assert(result.errors.length);
    assert.equal(snapshot(), before);
  }
  assert.equal(orders.getOrder(first.id)?.balance, 120);
  assert.equal(orders.getOrder(selected.id)?.balance, 80);
});
test("a settled order cannot accept stale replay, even when another order remains unpaid", () => {
  reset();
  const first = create(120), selected = create(80);
  const target = { sourceType: "service_order", id: selected.id };
  assert.deepEqual(store.recordCustomerPayment({
    customerId: "c", amount: 80, method: "cash", target,
  }).errors, []);
  const before = snapshot();
  const replay = store.recordCustomerPayment({
    customerId: "c", amount: 80, method: "cash", target,
  });
  assert.equal(replay.payment, null);
  assert.equal(snapshot(), before);
  assert.equal(orders.getOrder(first.id)?.balance, 120);
  assert.equal(orders.getOrder(selected.id)?.balance, 0);
});
test("Windows order detail uses app-wide SQLite-acknowledged targeted payment flow", () => {
  const app = fs.readFileSync(new URL("../../../../apps/desktop/src/App.tsx", import.meta.url), "utf8");
  const component = fs.readFileSync(new URL("../../../../apps/desktop/src/components/DesktopServiceOrderDetail.tsx", import.meta.url), "utf8");
  const hook = fs.readFileSync(new URL("../../../../apps/desktop/src/lib/use-desktop-customer-collection.ts", import.meta.url), "utf8");
  const detail = fs.readFileSync(new URL("../../../ui/src/components/orders/OrderDetail.tsx", import.meta.url), "utf8");
  assert.match(detail, /Collect Customer Due/);
  assert.match(app, /DesktopServiceOrderDetail collection=\\{customerCollection\\}/);
  assert.match(component, /onCollectBalance=\\{openCollection\\}/);
  assert.match(component, /target: \\{ sourceType: "service_order", id: order\\.id \\}/);
  assert.match(component, /collection\\.collect\\(/);
  assert.match(component, /collection\\.retryPending\\(\\)/);
  assert.match(hook, /target\\?: \\{ sourceType: "service_order" \\| "laundry"/);
});
