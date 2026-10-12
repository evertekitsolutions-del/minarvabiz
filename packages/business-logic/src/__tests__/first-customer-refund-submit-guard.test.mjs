import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename,
);

const { createCheckoutSubmitGate } = require("../../../ui/src/components/sales/checkout-submit-gate.ts");
const store = require("../store.ts");
const returns = require("../phase7-store.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const remote = require("../remote-write.ts");
permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);
const initialAccounts = structuredClone(accounting.exportAccountingState().accounts);

function reset() {
  accounting.hydrateAccountingState({ accounts: structuredClone(initialAccounts), journals: [], journalSequence: 0 });
  store.hydrateCore({
    products: [{ id: "cloth", name: "Fabric", stockQuantity: 10, costPrice: 20, sellingPrice: 100, isActive: true, version: 1 }],
    customers: [{ id: "buyer", name: "Buyer", totalSpending: 0, outstandingBalance: 0 }],
    sales: [], payments: [],
  });
  returns.hydratePhase7({ returns: [], auditLogs: [] });
  outbox.hydrateOutbox([]);
  const sale = store.createSale({
    customerId: "buyer",
    lines: [{ productId: "cloth", productName: "Fabric", stockQuantity: 10, quantity: 3, unitPrice: 100, costPrice: 20, discountPercent: 0, taxRate: 0 }],
    paidAmount: 300, paymentMethod: "cash",
  });
  assert.deepEqual(sale.errors, []);
  assert.equal(store.getProduct("cloth").stockQuantity, 7);
  return sale.sale;
}
function input(sale, quantity) {
  return {
    saleId: sale.id, reason: "other", refundMethod: "cash",
    items: [{ saleItemId: sale.items[0].id, productId: "cloth", productName: "Fabric", unitPrice: 100, quantity, restock: true }],
  };
}
function fingerprint() {
  return JSON.stringify({
    returns: returns.listReturns(), sale: store.listSales(), payments: store.listPayments(),
    products: store.listProducts(), journal: accounting.exportAccountingState(),
    outbox: outbox.exportOutbox(),
  });
}

test("rapid repeat refund gesture creates one return, one refund payment and one stock restock", () => {
  const sale = reset();
  const gate = createCheckoutSubmitGate();
  function clickRefund() {
    if (!gate.tryStart()) return null;
    const outcome = returns.createReturn(input(sale, 1));
    if (outcome.errors.length) gate.release();
    return outcome;
  }
  const first = clickRefund();
  assert.deepEqual(first.errors, []);
  assert.equal(clickRefund(), null, "second stale React click must not invoke refund");
  assert.equal(returns.listReturns().length, 1);
  assert.equal(store.getProduct("cloth").stockQuantity, 8);
  assert.equal(store.listPayments().filter(p => p.referenceType === "refund").length, 1);
  assert.equal(accounting.buildBalanceSheet().balanced, true);

  const afterFirst = fingerprint();
  assert.equal(clickRefund(), null);
  assert.equal(fingerprint(), afterFirst, "repeat click must have no side effects");

  // Deliberately reopening the form begins a distinct, explicitly requested refund.
  gate.release();
  const second = clickRefund();
  assert.deepEqual(second.errors, []);
  assert.equal(returns.listReturns().length, 2);
  assert.equal(store.getProduct("cloth").stockQuantity, 9);
  assert.equal(store.listPayments().filter(p => p.referenceType === "refund").length, 2);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});

test("rejected refund permits a corrected retry instead of permanently locking the cashier", () => {
  const sale = reset();
  const gate = createCheckoutSubmitGate();
  const initial = fingerprint();
  assert.equal(gate.tryStart(), true);
  const invalid = returns.createReturn(input(sale, 100));
  assert.ok(invalid.errors.length);
  gate.release();
  assert.equal(fingerprint(), initial);
  assert.equal(gate.tryStart(), true);
  const good = returns.createReturn(input(sale, 1));
  assert.deepEqual(good.errors, []);
  assert.equal(returns.listReturns().length, 1);
  assert.equal(gate.tryStart(), false);
});

test("ReturnsPanel protects both refund and exchange callbacks before executing either action", () => {
  const source = fs.readFileSync(new URL("../../../ui/src/components/returns/ReturnsPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /React\.useRef\(createCheckoutSubmitGate\(\)\)/);
  const openFlow = source.slice(source.indexOf("  function openFlow("), source.indexOf("  function buildReturnItems("));
  assert.match(openFlow, /returnSubmitGate\.current\.release\(\)/);
  const submit = source.slice(source.indexOf("  function submit()"), source.indexOf("  return (\n    <div className=", source.indexOf("  function submit()")));
  const claimed = submit.indexOf("returnSubmitGate.current.tryStart()");
  assert.ok(claimed > 0);
  assert.ok(submit.indexOf("onExchange!(") > claimed);
  assert.ok(submit.indexOf("onCreate({") > claimed);
  assert.ok((submit.match(/returnSubmitGate\.current\.release\(\)/g) || []).length >= 3, "retry on both rejection and exception");
  assert.match(submit, /setOpen\(false\);\s*resetForm\(\);/);
  assert.ok(!submit.slice(submit.indexOf("setOpen(false);")).includes("returnSubmitGate.current.release()"), "keep success latched through modal state reset");
});
