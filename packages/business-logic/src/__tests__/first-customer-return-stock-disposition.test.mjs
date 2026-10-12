import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename,
);

const { resolveReturnRestock } = require("../../../ui/src/components/returns/return-stock-disposition.ts");
const store = require("../store.ts");
const returns = require("../phase7-store.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const remote = require("../remote-write.ts");
permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);
const accounts = structuredClone(accounting.exportAccountingState().accounts);

const cart = {
  productId: "fabric", productName: "Linen", stockQuantity: 3,
  quantity: 1, unitPrice: 100, costPrice: 20, discountPercent: 0, taxRate: 0,
};
function setup(stock = 3) {
  accounting.hydrateAccountingState({ accounts: structuredClone(accounts), journals: [], journalSequence: 0 });
  store.hydrateCore({
    products: [{ id: "fabric", name: "Linen", costPrice: 20, sellingPrice: 100, stockQuantity: stock, isActive: true, version: 1 }],
    customers: [{ id: "buyer", name: "Buyer", totalSpending: 0, outstandingBalance: 0 }],
    sales: [], payments: [],
  });
  returns.hydratePhase7({ returns: [], auditLogs: [] });
  outbox.hydrateOutbox([]);
  const result = store.createSale({
    customerId: "buyer", lines: [{ ...cart, stockQuantity: stock }],
    paidAmount: 100, paymentMethod: "cash",
  });
  assert.deepEqual(result.errors, []);
  return result.sale;
}
function selection(sale, restock) {
  return [{ saleItemId: sale.items[0].id, productId: "fabric", productName: "Linen", quantity: 1, unitPrice: 100, restock }];
}
function state() {
  return JSON.stringify({
    products: store.listProducts(), customers: store.listCustomers(),
    sales: store.listSales(), payments: store.listPayments(),
    returns: returns.listReturns(), journals: accounting.listJournalEntries(), outbox: outbox.exportOutbox(),
  });
}

test("defective goods default to no sellable restock, with a remembered per-item override", () => {
  assert.equal(resolveReturnRestock("defective", undefined), false);
  assert.equal(resolveReturnRestock("customer_changed_mind", undefined), true);
  assert.equal(resolveReturnRestock("wrong_item", undefined), true);
  assert.equal(resolveReturnRestock("defective", true), true);
  assert.equal(resolveReturnRestock("size_issue", false), false);
  assert.equal(resolveReturnRestock("other", false), false);
});

test("defective return refund leaves unsellable item outside available inventory", () => {
  const sale = setup();
  const remaining = store.getProduct("fabric").stockQuantity;
  assert.equal(remaining, 2);
  const result = returns.createReturn({
    saleId: sale.id, reason: "defective", refundMethod: "cash",
    items: selection(sale, resolveReturnRestock("defective", undefined)),
    notes: "Damaged fabric - exclude from saleable inventory",
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ret.items[0].restock, false);
  assert.equal(result.ret.totalRefund, 100);
  assert.equal(store.getProduct("fabric").stockQuantity, remaining);
  assert.equal(store.listPayments().filter(p => p.referenceType === "refund").length, 1);
  assert.equal(store.getCustomer("buyer").totalSpending, 0);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});

test("explicit valid restock on returned sellable item restores stock", () => {
  const sale = setup();
  const result = returns.createReturn({
    saleId: sale.id, reason: "customer_changed_mind", refundMethod: "cash",
    items: selection(sale, resolveReturnRestock("customer_changed_mind", undefined)),
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ret.items[0].restock, true);
  assert.equal(store.getProduct("fabric").stockQuantity, 3);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});

test("defective no-restock exchange cannot reuse unsellable stock and leaves original untouched", () => {
  const sale = setup(1);
  const before = state();
  const result = returns.createExchange({
    saleId: sale.id, reason: "defective", refundMethod: "cash", paymentMethod: "cash",
    returnItems: selection(sale, resolveReturnRestock("defective", undefined)),
    replacementLines: [{ ...cart, stockQuantity: 0 }], additionalPaidAmount: 0,
  });
  assert.equal(result.ret, null);
  assert.equal(result.replacementSale, null);
  assert.match(result.errors.join("; "), /insufficient (live )?stock/i);
  assert.equal(state(), before);
});

test("ReturnsPanel exposes individual disposition and resets overrides between invoices/flows", () => {
  const ui = fs.readFileSync(new URL("../../../ui/src/components/returns/ReturnsPanel.tsx", import.meta.url), "utf8");
  assert.match(ui, /const \[restockByItem, setRestockByItem\]/);
  assert.match(ui, /restock: resolveReturnRestock\(reason, restockByItem\[item\.id\]\)/);
  assert.match(ui, /Stock disposition for/);
  assert.match(ui, /Restock sellable/);
  assert.match(ui, /Do not restock/);
  assert.match(ui, /onChange=\{\(e\) => setRestockByItem/);
  const resetCount = (ui.match(/setRestockByItem\(\{\}\)/g) ?? []).length;
  assert.ok(resetCount >= 3, "form reset, preferred auto-open and invoice change all clear overrides");
  assert.match(ui, /\.filter\(\(item\) => item\.productId === product\.id && item\.restock\)/);
});
