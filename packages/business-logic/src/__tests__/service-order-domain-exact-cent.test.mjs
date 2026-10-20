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
  }).outputText, filename
);

const orders = require("../orders-store.ts");
const customers = require("../store.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const remote = require("../remote-write.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);
const systemAccounts = structuredClone(accounting.exportAccountingState().accounts);

function reset() {
  accounting.hydrateAccountingState({ accounts: structuredClone(systemAccounts), journals: [], journalSequence: 0 });
  customers.hydrateCore({
    customers: [{
      id: "cent-test", name: "Cent Test Customer", outstandingBalance: 0, totalSpending: 0,
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    }],
    products: [], sales: [], payments: [],
  });
  orders.hydrateOrders({ orders: [], measurements: [] });
  outbox.hydrateOutbox([]);
}
function snapshot() {
  return JSON.stringify({
    orders: orders.listOrders(), customer: customers.getCustomer("cent-test"),
    payments: customers.listPayments(), accounting: accounting.exportAccountingState(),
    outbox: outbox.exportOutbox(),
  });
}
const base = { customerId: "cent-test", serviceType: "ladies_tailoring", price: 100.25 };

test("all direct service-order money fields reject fractional cents without mutations", () => {
  reset();
  const before = snapshot();
  const cases = [
    ["Price", { price: 100.001 }],
    ["Price", { price: 1e-7 }],
    ["Price", { price: Infinity }],
    ["Price", { price: -1 }],
    ["Discount", { discount: .001 }],
    ["Advance", { advance: 5.005 }],
    ["External material cost", { externalMaterialCost: 30.009 }],
    ["Bulk discount", { bulkDiscount: 20.001 }],
    ["Unit price", { unitPrice: 5.005 }],
  ];
  for (const [field, patch] of cases) {
    const result = orders.createOrder({ ...base, ...patch });
    assert.equal(result.order, null, field);
    assert.ok(result.errors.join(" ").toLowerCase().includes(field.toLowerCase()), field);
    assert.equal(snapshot(), before, field + " mutated a financial store");
  }
});

test("T-shirt customer amount and printing cost reject fractional cents", () => {
  reset();
  const before = snapshot();
  for (const field of ["printingCost", "customerPrice"]) {
    const tshirt = { quantity: 2, printingCost: 20.25, customerPrice: 100.25, [field]: 10.001 };
    const result = orders.createOrder({ ...base, serviceType: "tshirt_printing", price: 0, tshirt });
    assert.equal(result.order, null, field);
    assert.match(result.errors.join(" "), /T-shirt/);
    assert.equal(snapshot(), before);
  }
});

test("valid exact-cent service order preserves payment and balanced posting", () => {
  reset();
  const result = orders.createOrder({ ...base, discount: 0.15, advance: 30.1, externalMaterialCost: 12.01 });
  assert.deepEqual(result.errors, []);
  assert.ok(result.order);
  assert.equal(result.order.price, 100.1);
  assert.equal(result.order.advance, 30.1);
  assert.equal(result.order.balance, 70);
  assert.equal(customers.getCustomer("cent-test").outstandingBalance, 70);
  assert.equal(customers.getCustomer("cent-test").totalSpending, 30.1);
  assert.equal(accounting.listJournalEntries().filter(j => j.referenceType === "auto_service_order").length, 1);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});
