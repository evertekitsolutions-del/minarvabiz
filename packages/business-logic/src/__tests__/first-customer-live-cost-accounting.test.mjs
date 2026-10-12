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

const store = require("../store.ts");
const guard = require("../sale-checkout-guard.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const remote = require("../remote-write.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);

const originalAccounts = structuredClone(accounting.exportAccountingState().accounts);
const cart = (quantity = 1, override = {}) => ({
  productId: "fabric", productName: "Linen (meter)", stockQuantity: 10,
  quantity, unitPrice: 100, costPrice: 8, discountPercent: 0, taxRate: 0,
  ...override,
});

function reset(liveCost = 37.50) {
  accounting.hydrateAccountingState({ accounts: structuredClone(originalAccounts), journals: [], journalSequence: 0 });
  store.hydrateCore({
    products: [{ id: "fabric", name: "Linen (meter)", sku: "FAB-001", stockQuantity: 10, costPrice: liveCost, sellingPrice: 100, isActive: true, version: 1 }],
    customers: [{ id: "buyer", name: "Buyer", totalSpending: 0, outstandingBalance: 0 }],
    sales: [], payments: [],
  });
  outbox.hydrateOutbox([]);
}
function sell(lines, paidAmount) {
  return store.createSale({
    customerId: "buyer", lines, paidAmount, paymentMethod: "cash",
  });
}
function balance(key) {
  const account = accounting.getSystemAccount(key);
  assert.ok(account, key + " account must exist");
  const row = accounting.buildTrialBalance().find(r => r.accountId === account.id);
  return Math.round(((row?.debit ?? 0) - (row?.credit ?? 0)) * 100) / 100;
}
function fingerprint() {
  return JSON.stringify({
    products: store.listProducts(), customers: store.listCustomers(),
    sales: store.listSales(), payments: store.listPayments(),
    journals: accounting.listJournalEntries(), outbox: outbox.exportOutbox(),
  });
}

test("stale cashier cost cannot misstate COGS / inventory asset on a paid sale", () => {
  reset(37.50);
  const lines = [cart(2, { costPrice: 8, unitPrice: 130 })];
  const original = structuredClone(lines);
  const result = sell(lines, 260);
  assert.deepEqual(result.errors, []);
  assert.equal(result.sale.items[0].costPrice, 37.50, "invoice inventory cost must match live product basis");
  assert.equal(result.sale.items[0].unitPrice, 130, "authorized cashier selling price must remain editable");
  assert.equal(result.sale.total, 260);
  assert.equal(store.getProduct("fabric").stockQuantity, 8);
  assert.equal(balance("cogs"), 75);
  assert.equal(balance("inventory_asset"), -75);
  assert.equal(balance("product_sales"), -260);
  assert.equal(balance("cash"), 260);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
  assert.deepEqual(lines, original, "caller cart snapshots must never be mutated");
});

test("duplicate lines and fractional fabric units use the same live basis and balanced accounting", () => {
  reset(12.50);
  const result = sell([cart(1.5), cart(2.5, { costPrice: 999 })], 400);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.sale.items.map(i => i.costPrice), [12.5, 12.5]);
  assert.equal(result.sale.items[0].quantity, 1.5);
  assert.equal(result.sale.items[1].quantity, 2.5);
  assert.equal(store.getProduct("fabric").stockQuantity, 6);
  assert.equal(balance("cogs"), 50);
  assert.equal(balance("inventory_asset"), -50);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});

test("invalid live cost fails before stock, sale, payments, ledgers or outbox mutate", () => {
  reset(Number.NaN);
  const before = fingerprint();
  const result = sell([cart(1, { costPrice: 8 })], 100);
  assert.match(result.errors.join(" "), /cost must be a finite non-negative amount/);
  assert.equal(fingerprint(), before);
});

test("legacy product missing master cost retains valid cart basis without breaking old offline carts", () => {
  reset(undefined);
  const original = [cart(1, { costPrice: 18 })];
  const resolved = guard.costSaleLinesFromLiveProducts(original, store.getProduct);
  assert.equal(resolved[0].costPrice, 18);
  assert.notEqual(resolved[0], original[0]);
  const result = sell(original, 100);
  assert.deepEqual(result.errors, []);
  assert.equal(result.sale.items[0].costPrice, 18);
  assert.equal(balance("cogs"), 18);
});

test("shared checkout uses the resolved cost for validation and sale items before posting", () => {
  const code = fs.readFileSync(new URL("../store.ts", import.meta.url), "utf8");
  const start = code.indexOf("export function createSale(");
  const end = code.indexOf("export function listPayments(", start);
  const body = code.slice(start, end);
  assert.match(body, /costSaleLinesFromLiveProducts\(input.lines, getProduct\)/);
  assert.match(body, /validateLiveSaleCheckout\(\s*costedLines,/);
  assert.match(body, /costedLines.map\(\(line\) => cartLineToSaleItem/);
  assert.match(body, /planSalePosting\(sale, requestedSplits, creditApplied\)/);
  assert.ok(body.indexOf("costSaleLinesFromLiveProducts") < body.indexOf("planSalePosting"));
});
