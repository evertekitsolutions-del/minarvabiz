import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(
  ts.transpileModule(fs.readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, path,
);

const store = require("../store.ts");
const returns = require("../phase7-store.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const remote = require("../remote-write.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);
const systemAccounts = structuredClone(accounting.exportAccountingState().accounts);

function line(quantity, extra = {}) {
  return {
    productId: "fabric", productName: "Linen", quantity, unitPrice: 80,
    costPrice: 25, discountPercent: 0, taxRate: 0, stockQuantity: 10, ...extra,
  };
}
function setup(openingStock) {
  accounting.hydrateAccountingState({ accounts: structuredClone(systemAccounts), journals: [], journalSequence: 0 });
  store.hydrateCore({
    products: [{ id: "fabric", name: "Linen", isActive: true, stockQuantity: openingStock, costPrice: 25, sellingPrice: 100, version: 1 }],
    customers: [{ id: "buyer", name: "Buyer", outstandingBalance: 0, totalSpending: 0 }],
    sales: [], payments: [],
  });
  returns.hydratePhase7({ returns: [], auditLogs: [] });
  outbox.hydrateOutbox([]);
  const created = store.createSale({
    customerId: "buyer", lines: [line(1, { unitPrice: 100, stockQuantity: openingStock })],
    paymentMethod: "cash", paidAmount: 100,
  });
  assert.deepEqual(created.errors, []);
  return created.sale;
}
function exchange(sale, replacementLines, extra = {}) {
  return returns.createExchange({
    saleId: sale.id, reason: "other", refundMethod: "cash", paymentMethod: "cash",
    returnItems: [{
      saleItemId: sale.items[0].id, productId: "fabric",
      productName: "Linen", unitPrice: 100, quantity: 1, restock: true,
    }],
    replacementLines, additionalPaidAmount: 0, ...extra,
  });
}
function fingerprint() {
  return JSON.stringify({
    products: store.listProducts(), customers: store.listCustomers(),
    sales: store.listSales(), payments: store.listPayments(),
    returns: returns.listReturns(), journal: accounting.exportAccountingState(),
    outbox: outbox.exportOutbox(),
  });
}

test("two individually available replacement lines are rejected when total quantity exceeds post-return stock", () => {
  const sale = setup(6);
  assert.equal(store.getProduct("fabric").stockQuantity, 5);
  const before = fingerprint();
  const result = exchange(sale, [line(4, { stockQuantity: 6 }), line(4, { stockQuantity: 6 })]);
  assert.equal(result.ret, null);
  assert.equal(result.replacementSale, null);
  assert.match(result.errors.join(" "), /insufficient (live )?stock/i);
  assert.equal(fingerprint(), before, "failure must not refund or restock original invoice");
});

test("fractional duplicate replacement demand also checks the total before returning", () => {
  const sale = setup(2);
  const before = fingerprint();
  const result = exchange(sale, [line(1.25, { stockQuantity: 2 }), line(1.25, { stockQuantity: 2 })]);
  assert.equal(result.ret, null);
  assert.match(result.errors.join(" "), /insufficient (live )?stock/i);
  assert.equal(fingerprint(), before);
});

test("exchange against zero stock may consume restocked original item without stale-cart rejection", () => {
  const sale = setup(1);
  assert.equal(store.getProduct("fabric").stockQuantity, 0);
  const result = exchange(sale, [line(1, { stockQuantity: 0, costPrice: 999 })]);
  assert.deepEqual(result.errors, []);
  assert.ok(result.ret);
  assert.ok(result.replacementSale);
  assert.equal(result.ret.resolution, "exchange");
  assert.equal(result.ret.exchangeSaleId, result.replacementSale.id);
  assert.equal(result.storeCreditApplied, 80);
  assert.equal(result.extraRefund, 20);
  assert.equal(result.replacementSale.total, 80);
  assert.equal(result.replacementSale.items[0].costPrice, 25, "live COGS must win over stale cart");
  assert.equal(store.getProduct("fabric").stockQuantity, 0);
  assert.equal(returns.listReturns().length, 1);
  assert.equal(store.listSales().length, 2);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
  assert.ok(outbox.listPendingOutbox().some(e => e.aggregateId === result.replacementSale.id));
});

test("inactive/missing replacement, invalid quantity and invalid price fail before any return mutation", () => {
  const sale = setup(4);
  const before = fingerprint();
  for (const replacement of [
    line(1, { productId: "missing" }),
    line(Number.NaN),
    line(1, { unitPrice: -5 }),
    line(1, { taxRate: Number.POSITIVE_INFINITY }),
  ]) {
    const result = exchange(sale, [replacement]);
    assert.ok(result.errors.length, JSON.stringify(replacement));
    assert.equal(result.ret, null);
    assert.equal(fingerprint(), before);
  }
});

test("exchange uses final sale checkout preflight and passes projected cart to real sale", () => {
  const body = fs.readFileSync(new URL("../phase7-store.ts", import.meta.url), "utf8");
  const start = body.indexOf("export function createExchange(");
  const end = body.indexOf("export function listAuditLogs", start);
  const exchangeSource = body.slice(start, end);
  assert.ok(exchangeSource.indexOf("validateLiveSaleCheckout(") < exchangeSource.indexOf("const returned = createReturn("));
  assert.match(exchangeSource, /costSaleLinesFromLiveProducts\(input\.replacementLines/);
  assert.match(exchangeSource, /lines: replacementLines,/);
  assert.match(exchangeSource, /projectedProducts\.get\(line\.productId\)\?\.stockQuantity/);
});
