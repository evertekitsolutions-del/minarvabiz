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
const sales = require("../sales.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const remote = require("../remote-write.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);
const accounts = structuredClone(accounting.exportAccountingState().accounts);
function reset(stock = 2) {
  accounting.hydrateAccountingState({ accounts: structuredClone(accounts), journals: [], journalSequence: 0 });
  store.hydrateCore({
    products: [{ id: "p", name: "Fabric", costPrice: 25, sellingPrice: 100, stockQuantity: stock, isActive: true, version: 1 }],
    customers: [{ id: "buyer", name: "Buyer", outstandingBalance: 0, totalSpending: 0 }],
    sales: [], payments: [],
  });
  outbox.hydrateOutbox([]);
}
function line(quantity, savedStock = 2) {
  return { productId: "p", productName: "Fabric", quantity, stockQuantity: savedStock, unitPrice: 100,
    costPrice: 25, discountPercent: 0, taxRate: 0 };
}
function sell(lines, paid = 0) {
  return store.createSale({ customerId: "buyer", lines, paidAmount: paid, paymentMethod: "cash" });
}
function fingerprint() {
  return JSON.stringify({
    products: store.listProducts(), customers: store.listCustomers(),
    sales: store.listSales(), payments: store.listPayments(),
    accounting: accounting.exportAccountingState(), outbox: outbox.exportOutbox(),
  });
}

test("replenished product can be sold from an older cart without a false stock rejection", () => {
  reset(2);
  const cart = [line(4, 2)];
  const saved = structuredClone(cart);
  assert.match(sales.validateCart(cart).join(" "), /insufficient stock/i,
    "pure cart validator still accurately represents the stale UI snapshot");
  store.adjustStock("p", "stock_in", 3, "receiving replenishment during active POS cart");
  assert.equal(store.getProduct("p").stockQuantity, 5);
  const result = sell(cart, 400);
  assert.deepEqual(result.errors, []);
  assert.equal(result.sale.total, 400);
  assert.equal(store.getProduct("p").stockQuantity, 1);
  assert.equal(store.listSales().length, 1);
  assert.equal(store.listPayments().length, 1);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
  assert.deepEqual(cart, saved, "the caller's old cart must not be rewritten");
});

test("fractional fabric quantities and repeated rows share the same replenished live stock", () => {
  reset(0);
  const cart = [line(1.25, 0), line(1.75, 0)];
  store.adjustStock("p", "stock_in", 3.5);
  const result = sell(cart, 300);
  assert.deepEqual(result.errors, []);
  assert.equal(store.getProduct("p").stockQuantity, 0.5);
  assert.equal(result.sale.items.length, 2);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});

test("old cart with generous cached stock cannot oversell current depleted stock", () => {
  reset(2);
  const before = fingerprint();
  const result = sell([line(1.25, 99), line(1.25, 99)], 250);
  assert.match(result.errors.join(" "), /insufficient (live )?stock/i);
  assert.equal(fingerprint(), before, "sale, payments, stock and journal must stay unchanged");
});

test("missing, retired, and non-finite live stock still fail closed", () => {
  reset(2);
  const product = store.getProduct("p");
  product.isActive = false;
  let before = fingerprint();
  let result = sell([line(1, 99)], 100);
  assert.match(result.errors.join(" "), /inactive/i);
  assert.equal(fingerprint(), before);

  product.isActive = true;
  product.stockQuantity = Number.NaN;
  before = fingerprint();
  result = sell([line(1, 99)], 100);
  assert.match(result.errors.join(" "), /stock/i);
  assert.equal(fingerprint(), before);

  reset(2);
  before = fingerprint();
  result = sell([{ ...line(1), productId: "missing" }], 100);
  assert.match(result.errors.join(" "), /product not found/i);
  assert.equal(fingerprint(), before);
});

test("single authoritative product lookup is used for cached quantity and aggregated check", () => {
  const { validateLiveSaleCheckout } = require("../sale-checkout-guard.ts");
  let lookupCount = 0;
  const product = { id: "p", name: "Fabric", stockQuantity: 3, costPrice: 25, isActive: true };
  const errors = validateLiveSaleCheckout([line(1.5, 0), line(1.5, 0)],
    { customerId: "buyer", paidAmount: 300 },
    () => { lookupCount++; return product; },
    () => ({ id: "buyer" }));
  assert.deepEqual(errors, []);
  assert.equal(lookupCount, 1);
});
