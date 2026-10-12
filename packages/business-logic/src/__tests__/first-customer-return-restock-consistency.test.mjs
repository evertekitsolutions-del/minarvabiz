import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  fileName: file,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);

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

function fixture() {
  accounting.hydrateAccountingState({ accounts: structuredClone(initialAccounts), journals: [], journalSequence: 0 });
  store.hydrateCore({
    products: [{ id: "p", name: "Restock Fabric", isActive: true, stockQuantity: 2, sellingPrice: 100, costPrice: 30, version: 1 }],
    customers: [{ id: "c", name: "Buyer", outstandingBalance: 0, totalSpending: 0 }],
    sales: [], payments: [],
  });
  returns.hydratePhase7({ returns: [], auditLogs: [] });
  outbox.hydrateOutbox([]);
  const result = store.createSale({
    customerId: "c", lines: [{ productId: "p", productName: "Restock Fabric", stockQuantity: 2,
      quantity: 1, unitPrice: 100, costPrice: 30, discountPercent: 0, taxRate: 0 }],
    paidAmount: 100, paymentMethod: "cash",
  });
  assert.deepEqual(result.errors, []);
  return result.sale;
}
function selected(sale, restock = true) {
  return [{ saleItemId: sale.items[0].id, productId: "p", productName: "Spoofed Name",
    quantity: 1, unitPrice: 9999, restock }];
}
function refund(sale, restock = true) {
  return returns.createReturn({ saleId: sale.id, reason: "other", refundMethod: "cash", items: selected(sale, restock) });
}
function state() {
  return JSON.stringify({
    products: store.listProducts(), customers: store.listCustomers(),
    sales: store.listSales(), payments: store.listPayments(), returns: returns.listReturns(),
    accounts: accounting.exportAccountingState(), outbox: outbox.exportOutbox(),
  });
}

test("archived product cannot create phantom restock: zero mutation of customer, invoice, ledger, outbox and payment", () => {
  const sale = fixture();
  store.getProduct("p").deletedAt = "2026-10-11T00:00:00.000Z";
  const before = state();
  const result = refund(sale, true);
  assert.equal(result.ret, null);
  assert.match(result.errors.join(" "), /unavailable for restocking/i);
  assert.equal(result.paidRefund, 0);
  assert.equal(state(), before);
});

test("missing product cannot be restocked even if invoice still exists", () => {
  const sale = fixture();
  store.hydrateCore({ products: [] });
  const before = state();
  const result = refund(sale, true);
  assert.equal(result.ret, null);
  assert.match(result.errors.join(" "), /restocking/i);
  assert.equal(state(), before);
});

test("customer may refund a discontinued product WITHOUT falsely restoring inventory", () => {
  const sale = fixture();
  store.hydrateCore({ products: [] });
  const result = refund(sale, false);
  assert.deepEqual(result.errors, []);
  assert.ok(result.ret);
  assert.equal(result.ret.items[0].restock, false);
  assert.equal(result.ret.items[0].productName, "Restock Fabric", "use original invoice name");
  assert.equal(result.paidRefund, 100);
  assert.equal(store.getSale(sale.id).status, "returned");
  assert.equal(store.listProducts().length, 0);
  assert.equal(returns.listReturns().length, 1);
  assert.equal(store.getCustomer("c").totalSpending, 0);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});

test("exchange cannot commit original refund when restock product is archived, even if replacement is available", () => {
  const sale = fixture();
  store.getProduct("p").deletedAt = "2026-10-11T00:00:00.000Z";
  store.hydrateCore({ products: [
    { id: "p", name: "Restock Fabric", isActive: true, stockQuantity: 1, sellingPrice: 100, costPrice: 30, version: 1,
      deletedAt: "2026-10-11T00:00:00.000Z" },
    { id: "q", name: "Other Item", isActive: true, stockQuantity: 4, sellingPrice: 80, costPrice: 20, version: 1 },
  ] });
  const before = state();
  const result = returns.createExchange({
    saleId: sale.id, reason: "other", refundMethod: "cash", paymentMethod: "cash",
    returnItems: selected(sale, true),
    replacementLines: [{ productId: "q", productName: "Other Item", stockQuantity: 4,
      quantity: 1, unitPrice: 80, costPrice: 20, discountPercent: 0, taxRate: 0 }],
    additionalPaidAmount: 0,
  });
  assert.equal(result.ret, null);
  assert.equal(result.replacementSale, null);
  assert.match(result.errors.join(" "), /unavailable for restocking/i);
  assert.equal(state(), before, "failed exchange must not refund, restock or create replacement");
});

test("successful active-product return still restores actual product stock and journal", () => {
  const sale = fixture();
  assert.equal(store.getProduct("p").stockQuantity, 1);
  const result = refund(sale, true);
  assert.deepEqual(result.errors, []);
  assert.equal(store.getProduct("p").stockQuantity, 2);
  assert.equal(returns.listReturns().length, 1);
  assert.equal(store.listPayments().length, 2);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});
