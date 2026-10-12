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
  }).outputText,
  filename,
);
const { createCheckoutSubmissionGate } = require("../checkout-submission-gate.ts");
const store = require("../store.ts");
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
    products: [{ id: "p", name: "Cotton Fabric", stockQuantity: 5, isActive: true, version: 1 }],
    customers: [{ id: "c", name: "Buyer", totalSpending: 0, outstandingBalance: 0 }],
    sales: [], payments: [],
  });
  outbox.hydrateOutbox([]);
}
function checkout() {
  const result = store.createSale({
    customerId: "c",
    lines: [{ productId: "p", productName: "Cotton Fabric", quantity: 1,
      stockQuantity: 5, unitPrice: 100, costPrice: 40, discountPercent: 0, taxRate: 0 }],
    paidAmount: 100, paymentMethod: "cash",
  });
  return { success: result.errors.length === 0, result };
}
function fingerprint() {
  return JSON.stringify({
    sales: store.listSales(), payments: store.listPayments(), products: store.listProducts(),
    customers: store.listCustomers(), journals: accounting.listJournalEntries(),
    outbox: outbox.exportOutbox(),
  });
}

test("rapid repeated checkout saves exactly one invoice, stock movement, receipt and journal", () => {
  reset();
  const gate = createCheckoutSubmissionGate();
  const first = gate.submit(checkout);
  assert.equal(first.status, "accepted");
  assert.equal(first.result.success, true);
  const afterFirst = fingerprint();
  const second = gate.submit(checkout);
  assert.deepEqual(second, { status: "blocked", reason: "saved" });
  assert.equal(fingerprint(), afterFirst, "second click must not touch stock, ledger, payments or outbox");
  assert.equal(store.listSales().length, 1);
  assert.equal(store.listPayments().length, 1);
  assert.equal(accounting.listJournalEntries().length, 1);
  assert.equal(store.getProduct("p").stockQuantity, 4);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
  assert.equal(gate.beginNewCart(), true);
  const next = gate.submit(checkout);
  assert.equal(next.status, "accepted");
  assert.equal(store.listSales().length, 2, "new cart may make a second intentional sale");
  assert.equal(store.getProduct("p").stockQuantity, 3);
});

test("rejected checkout unlocks; ambiguous exception blocks until a deliberate new cart", () => {
  const gate = createCheckoutSubmissionGate();
  assert.equal(gate.submit(() => ({ success: false, errors: ["Payment invalid"] })).status, "accepted");
  assert.equal(gate.status(), "ready");
  assert.equal(gate.submit(() => ({ success: true })).status, "accepted");
  assert.equal(gate.status(), "saved");
  gate.beginNewCart();
  assert.throws(() => gate.submit(() => { throw Error("print failed after save"); }), /print failed/);
  assert.equal(gate.status(), "uncertain");
  assert.deepEqual(gate.submit(() => ({ success: true })), { status: "blocked", reason: "uncertain" });
  assert.equal(gate.beginNewCart(), true);
  assert.equal(gate.status(), "ready");
});

test("nested callback cannot submit again while first checkout is running", () => {
  const gate = createCheckoutSubmissionGate();
  let invoked = 0;
  const first = gate.submit(() => {
    invoked++;
    assert.deepEqual(gate.submit(() => { invoked++; return { success: true }; }),
      { status: "blocked", reason: "running" });
    assert.equal(gate.beginNewCart(), false);
    return { success: true };
  });
  assert.equal(first.status, "accepted");
  assert.equal(invoked, 1);
});

test("POS and Normal Billing both fence actual save callbacks and allow fresh carts", () => {
  const pos = fs.readFileSync("packages/ui/src/components/sales/PosBilling.tsx", "utf8");
  const normal = fs.readFileSync("packages/ui/src/components/sales/NormalBilling.tsx", "utf8");
  for (const source of [pos, normal]) {
    assert.match(source, /createCheckoutSubmissionGate\(\)/);
    assert.match(source, /checkoutGate\.current\.submit\(/);
    assert.match(source, /checkoutGate\.current\.beginNewCart\(\)/);
    assert.match(source, /Sales History/);
  }
  assert.match(pos, /checkoutGate\.current\.submit\(\(\) => submit\(/);
  assert.match(normal, /checkoutGate\.current\.submit\(\(\) => onCompleteSale\(/);
});
