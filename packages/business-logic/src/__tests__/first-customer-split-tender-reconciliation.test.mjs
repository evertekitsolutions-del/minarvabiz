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

const sales = require("../sales.ts");
const store = require("../store.ts");
const accounting = require("../accounting-store.ts");
const posting = require("../sales-accounting.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const remote = require("../remote-write.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);
const initialAccounts = structuredClone(accounting.exportAccountingState().accounts);
const ITEM = {
  productId: "p", productName: "Fabric", quantity: 1, unitPrice: 100,
  discountPercent: 0, taxRate: 0, costPrice: 25, stockQuantity: 20,
};

function reset() {
  accounting.hydrateAccountingState({ accounts: structuredClone(initialAccounts), journals: [], journalSequence: 0 });
  store.hydrateCore({
    products: [{ id: "p", name: "Fabric", stockQuantity: 20, isActive: true, version: 1 }],
    customers: [{ id: "c", name: "Buyer", outstandingBalance: 0, totalSpending: 0 }],
    sales: [], payments: [],
  });
  outbox.hydrateOutbox([]);
}
function checkout(splits, extra = {}) {
  return store.createSale({
    customerId: "c", lines: [ITEM], paidAmount: splits.reduce((s, v) => s + v.amount, 0),
    paymentMethod: splits[0]?.method ?? "cash", paymentSplits: splits, ...extra,
  });
}
function trialBalance(key) {
  const account = accounting.getSystemAccount(key);
  assert.ok(account, "System account must exist: " + key);
  const row = accounting.buildTrialBalance().find(r => r.accountId === account.id);
  return Math.round(((row?.debit ?? 0) - (row?.credit ?? 0)) * 100) / 100;
}
function paymentMix(result) {
  return Object.fromEntries(result.payments.map(payment => [payment.method, payment.amount]));
}
function assertBalanced() {
  assert.equal(accounting.buildBalanceSheet().balanced, true);
  for (const journal of accounting.listJournalEntries()) {
    assert.equal(journal.totalDebit, journal.totalCredit);
  }
}
function fingerprint() {
  return JSON.stringify({
    sales: store.listSales(), payments: store.listPayments(), products: store.listProducts(),
    customers: store.listCustomers(), journals: accounting.listJournalEntries(), outbox: outbox.exportOutbox(),
  });
}

test("minor-unit cash change is subtracted from cash only, independently of split order", () => {
  for (const splits of [
    [{ method: "cash", amount: 50 }, { method: "card", amount: 80 }],
    [{ method: "card", amount: 80 }, { method: "cash", amount: 50 }],
    [{ method: "cash", amount: 15 }, { method: "card", amount: 80 }, { method: "cash", amount: 35 }],
  ]) {
    const original = structuredClone(splits);
    const tender = sales.settleTenderReceipts(100, splits);
    assert.deepEqual(tender.errors, []);
    assert.equal(tender.tendered, 130);
    assert.equal(tender.collectible, 100);
    assert.equal(tender.changeDue, 30);
    assert.equal(tender.settledSplits.filter(p => p.method === "card").reduce((s, p) => s + p.amount, 0), 80);
    assert.equal(tender.settledSplits.filter(p => p.method === "cash").reduce((s, p) => s + p.amount, 0), 20);
    assert.deepEqual(splits, original, "Pure settlement must not mutate the cashier's entered tender");
  }
});

test("cash-first over-tender creates actual net receipts in payments and journal, not input-order clipping", () => {
  reset();
  const result = checkout([{ method: "cash", amount: 50, reference: "drawer" }, { method: "card", amount: 80, reference: "terminal" }]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(paymentMix(result), { cash: 20, card: 80 });
  assert.equal(result.payments[0].notes, "drawer");
  assert.equal(result.payments[1].notes, "terminal");
  assert.equal(result.sale.paidAmount, 100);
  assert.equal(result.sale.balanceAmount, 0);
  assert.equal(trialBalance("cash"), 20);
  assert.equal(trialBalance("payment_clearing"), 80);
  assert.equal(trialBalance("accounts_receivable"), 0);
  assert.equal(store.getProduct("p").stockQuantity, 19);
  assertBalanced();
});

test("card-first and multiple cash inputs reconcile to identical net payment method amounts", () => {
  for (const splits of [
    [{ method: "card", amount: 80 }, { method: "cash", amount: 50 }],
    [{ method: "cash", amount: 15 }, { method: "card", amount: 80 }, { method: "cash", amount: 35 }],
    [{ method: "bank", amount: 75 }, { method: "cash", amount: 35 }],
  ]) {
    reset();
    const result = checkout(splits);
    assert.deepEqual(result.errors, []);
    assert.equal(result.sale.paidAmount, 100);
    const byMethod = result.payments.reduce((acc, p) => ({ ...acc, [p.method]: (acc[p.method] ?? 0) + p.amount }), {});
    assert.equal(byMethod.cash, splits.some(s => s.method === "bank") ? 25 : 20);
    assert.equal(trialBalance("cash"), byMethod.cash);
    assert.equal(trialBalance("bank"), byMethod.bank ?? 0);
    assert.equal(trialBalance("payment_clearing"), byMethod.card ?? 0);
    assertBalanced();
  }
});

test("partial card/UPI collection remains receivable and cash-less exact tender is unchanged", () => {
  reset();
  const result = checkout([{ method: "upi", amount: 25 }, { method: "cash", amount: 10 }]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.sale.paidAmount, 35);
  assert.equal(result.sale.balanceAmount, 65);
  assert.equal(result.sale.status, "partial");
  assert.deepEqual(paymentMix(result), { upi: 25, cash: 10 });
  assert.equal(trialBalance("accounts_receivable"), 65);
  assert.equal(trialBalance("cash"), 10);
  assert.equal(trialBalance("payment_clearing"), 25);
  assertBalanced();
  reset();
  const exact = checkout([{ method: "bank", amount: 45 }, { method: "upi", amount: 55 }]);
  assert.deepEqual(exact.errors, []);
  assert.deepEqual(paymentMix(exact), { bank: 45, upi: 55 });
  assert.equal(trialBalance("bank"), 45);
  assert.equal(trialBalance("cash"), 0);
  assertBalanced();
});

test("store/exchange credit is never treated as external cash or terminal collection", () => {
  reset();
  const result = checkout([
    { method: "cash", amount: 50 }, { method: "card", amount: 40 },
  ], { creditAmount: 40 });
  assert.deepEqual(result.errors, []);
  assert.equal(result.sale.total, 100);
  assert.equal(result.sale.paidAmount, 100);
  assert.deepEqual(paymentMix(result), { cash: 20, card: 40 });
  assert.equal(result.payments.reduce((sum, payment) => sum + payment.amount, 0), 60);
  assert.equal(trialBalance("exchange_credit"), 40);
  assert.equal(trialBalance("cash"), 20);
  assert.equal(trialBalance("payment_clearing"), 40);
  assertBalanced();
});

test("unfunded non-cash overpayment fails without touching ledger, stock or customer", () => {
  reset();
  const before = fingerprint();
  const wrong = checkout([{ method: "cash", amount: 10 }, { method: "card", amount: 110 }]);
  assert.ok(wrong.errors.some(err => /cash|overpay/i.test(err)));
  assert.equal(fingerprint(), before);
  const error = checkout([{ method: "card", amount: Number.POSITIVE_INFINITY }], { paidAmount: 0 });
  assert.ok(error.errors.length);
  assert.equal(fingerprint(), before);
});

test("accounting plan rejects unbalanced gross tender mix instead of clipping it", () => {
  reset();
  const created = checkout([{ method: "card", amount: 100 }]);
  assert.deepEqual(created.errors, []);
  const wrong = posting.planSalePosting(created.sale, [
    { method: "cash", amount: 50 }, { method: "card", amount: 80 },
  ], 0);
  assert.match(wrong.errors.join("; "), /allocation exceeds net receipts/i);
  assertBalanced();
});
