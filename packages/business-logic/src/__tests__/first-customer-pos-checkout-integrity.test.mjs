import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);

const sales = require("../sales.ts");
const store = require("../store.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const remote = require("../remote-write.ts");
permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);
const systemAccounts = accounting.exportAccountingState().accounts;

const line = (quantity, overrides = {}) => ({
  productId: "item", productName: "First Customer Item", stockQuantity: 5,
  quantity, unitPrice: 100, costPrice: 40, discountPercent: 0, taxRate: 0,
  ...overrides,
});
function reset() {
  accounting.hydrateAccountingState({ accounts: structuredClone(systemAccounts), journals: [], journalSequence: 0 });
  store.hydrateCore({
    products: [{ id: "item", name: "First Customer Item", isActive: true, stockQuantity: 5, version: 1 }],
    customers: [{ id: "buyer", name: "Buyer", totalSpending: 0, outstandingBalance: 0 }],
    sales: [], payments: [],
  });
  outbox.hydrateOutbox([]);
}
function sale(lines, extra = {}) {
  return store.createSale({
    lines, customerId: "buyer", paidAmount: 0, paymentMethod: "cash", ...extra,
  });
}
function fingerprint() {
  return JSON.stringify({
    products: store.listProducts(), sales: store.listSales(), payments: store.listPayments(),
    customers: store.listCustomers(), outbox: outbox.exportOutbox(), journals: accounting.listJournalEntries(),
  });
}

test("cart aggregates repeated product demand and rejects overstock in shared validator", () => {
  assert.match(sales.validateCart([line(3), line(3)]).join(" "), /insufficient stock/);
  assert.deepEqual(sales.validateCart([line(2), line(3)]), []);
  assert.deepEqual(sales.validateCart([line(3), line(3)], { allowNegativeStock: true }), []);
  assert.match(sales.validateCart([line(1, { costPrice: Number.NaN })]).join(" "), /cost/);
});

test("checkout refuses duplicated and stale cart stock before mutating sale, ledger or cash", () => {
  reset();
  let prior = fingerprint();
  let result = sale([line(3), line(3)]);
  assert.match(result.errors.join(" "), /stock/i);
  assert.equal(fingerprint(), prior);

  result = sale([line(6, { stockQuantity: 999 })]);
  assert.match(result.errors.join(" "), /insufficient live stock/i);
  assert.equal(fingerprint(), prior);

  result = sale([line(1, { productId: "gone" })]);
  assert.match(result.errors.join(" "), /Product not found/i);
  assert.equal(fingerprint(), prior);

  result = sale([line(1)], { customerId: "foreign-customer" });
  assert.match(result.errors.join(" "), /customer no longer exists/i);
  assert.equal(fingerprint(), prior);
});

test("tender rejects invalid method, numeric coercion and malformed paid values without side effects", () => {
  reset();
  const prior = fingerprint();
  for (const amount of [NaN, Infinity, -1]) {
    const state = sales.validateTender(100, [{ method: "cash", amount }]);
    assert.ok(state.errors.length, String(amount));
    const result = sale([line(1)], { paymentSplits: [{ method: "cash", amount }], paidAmount: 0 });
    assert.ok(result.errors.length, String(amount));
    assert.equal(fingerprint(), prior);
  }
  assert.ok(sales.validateTender(100, [{ method: "refund", amount: 20 }]).errors.length);
  assert.ok(sale([line(1)], { paidAmount: Infinity }).errors.length);
  assert.ok(sale([line(1)], { paymentSplits: [{ method: "refund", amount: 20 }] }).errors.length);
  assert.equal(fingerprint(), prior);
});

test("valid split quantities still sell, decrement stock once and post a balanced ledger", () => {
  reset();
  const result = sale([line(2), line(3)], {
    paymentSplits: [{ method: "card", amount: 300 }, { method: "cash", amount: 200 }],
    paidAmount: 500,
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.sale.items.length, 2);
  assert.equal(result.sale.total, 500);
  assert.equal(store.getProduct("item").stockQuantity, 0);
  assert.equal(store.listSales().length, 1);
  assert.equal(result.payments.length, 2);
  assert.equal(result.sale.balanceAmount, 0);
  const journals = accounting.listJournalEntries();
  assert.equal(journals.length, 1);
  assert.equal(journals[0].totalDebit, journals[0].totalCredit);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});

test("billing UIs preserve fractional quantity and do not silently coerce bad tender input", () => {
  const normal = fs.readFileSync("packages/ui/src/components/sales/NormalBilling.tsx", "utf8");
  const pos = fs.readFileSync("packages/ui/src/components/sales/PosBilling.tsx", "utf8");
  assert.match(normal, /const quantity = Number\(qty\)/);
  assert.match(normal, /step="any" value=\{qty\}/);
  assert.match(normal, /Paid amount must be a valid non-negative number/);
  assert.match(pos, /function parsedTenderAmount\(value: string\)/);
  assert.match(pos, /amount: parsedTenderAmount\(row.amount\)/);
  assert.doesNotMatch(pos, /Math.max\(0, Number\(row.amount\) \|\| 0\)/);
});

test("fractional textile quantities post exact stock and payment without rounding to whole units", () => {
  reset();
  const result = sale([line(1.5), line(2.5)], { paidAmount: 400 });
  assert.deepEqual(result.errors, []);
  assert.equal(result.sale.total, 400);
  assert.equal(result.sale.items[0].quantity, 1.5);
  assert.equal(result.sale.items[1].quantity, 2.5);
  assert.equal(store.getProduct("item").stockQuantity, 1);
  assert.equal(result.sale.paidAmount, 400);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});
