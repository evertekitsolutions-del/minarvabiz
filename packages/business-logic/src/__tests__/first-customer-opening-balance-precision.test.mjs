import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText, filename,
);

const opening = require("../opening-balances.ts");
const store = require("../store.ts");
const supplierStore = require("../phase5-store.ts");
const cashRegister = require("../cash-register.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
const chart = accounting.exportAccountingState().accounts;

function reset({ customer = 0, supplier = 0, stock = 2, cost = 5 } = {}) {
  accounting.hydrateAccountingState({ accounts: chart, journals: [], journalSequence: 0 });
  store.hydrateCore({
    customers: [{
      id: "c", name: "Opening customer", outstandingBalance: customer,
      totalSpending: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01",
    }],
    products: [{
      id: "p", name: "Opening item", unit: "pcs", stockQuantity: stock,
      costPrice: cost, sellingPrice: 10, minimumStock: 0, isActive: true,
      createdAt: "2026-01-01", updatedAt: "2026-01-01", version: 1,
    }],
    categories: [], sales: [], payments: [],
  });
  supplierStore.hydratePhase5({
    suppliers: [{
      id: "s", name: "Opening supplier", openingBalance: 0,
      outstandingBalance: supplier, createdAt: "2026-01-01", updatedAt: "2026-01-01",
    }],
    expenses: [], purchases: [], laundryOrders: [], expenseCategories: [],
  });
  cashRegister.hydrateCashRegister({ sessions: [] });
  outbox.hydrateOutbox([]);
}

function state() {
  return JSON.stringify({
    customer: store.getCustomer("c"),
    supplier: supplierStore.getSupplier("s"),
    product: store.getProduct("p"),
    cash: cashRegister.exportCashRegisterState(),
    accounting: accounting.exportAccountingState(),
    outbox: outbox.exportOutbox(),
  });
}

const entryPoints = [
  { label: "customer receivable", apply: amount => opening.setOpeningCustomerBalance("c", amount) },
  { label: "supplier payable", apply: amount => opening.setOpeningSupplierBalance("s", amount) },
  { label: "stock quantity", apply: amount => opening.setOpeningStock("p", amount) },
  { label: "bank", apply: amount => opening.setOpeningBank(amount) },
  { label: "cash", apply: amount => opening.setOpeningCash(amount) },
];

test("all five first-customer opening figures reject unsupported decimals atomically", () => {
  for (const field of entryPoints) {
    for (const amount of [
      field.label === "stock quantity" ? 2.0005 : 12.345,
      0.0001,
      0.0000000001,
      1e-16,
    ]) {
      reset();
      const before = state();
      const result = field.apply(amount);
      assert.equal(result.ok, false, field.label + ": " + amount);
      assert.match(result.error, /opening|balance|quantity/i);
      assert.equal(state(), before, field.label + " must not change ledger, outbox or local data");
    }
  }
});

test("corrupt pre-existing customer, supplier, stock and cost precision blocks reconciliation", () => {
  const invalid = [
    { opts: { customer: 5.005 }, apply: () => opening.setOpeningCustomerBalance("c", 10) },
    { opts: { supplier: 3.333 }, apply: () => opening.setOpeningSupplierBalance("s", 10) },
    { opts: { stock: 1.0005 }, apply: () => opening.setOpeningStock("p", 3) },
    { opts: { cost: 1.001 }, apply: () => opening.setOpeningStock("p", 3) },
  ];
  for (const { opts, apply } of invalid) {
    reset(opts);
    const before = state();
    const result = apply();
    assert.equal(result.ok, false, JSON.stringify(opts));
    assert.match(result.error, /reconciliation/i);
    assert.equal(state(), before, "existing invalid values must not become rounded postings");
  }
});

test("valid cent/milli figures and binary-float sums still post accurately", () => {
  const cases = [
    { amount: 0.3, apply: () => opening.setOpeningCustomerBalance("c", 0.1 + 0.2), check: () => store.getCustomer("c").outstandingBalance },
    { amount: 0.3, apply: () => opening.setOpeningSupplierBalance("s", 0.1 + 0.2), check: () => supplierStore.getSupplier("s").outstandingBalance },
    { amount: 2.125, apply: () => opening.setOpeningStock("p", 2.125), check: () => store.getProduct("p").stockQuantity },
    { amount: 0.3, apply: () => opening.setOpeningBank(0.1 + 0.2), check: () => accounting.listJournalEntries().find(e => e.referenceType === "auto_opening_bank")?.lines.find(l => l.debit > 0)?.debit },
    { amount: 0.3, apply: () => opening.setOpeningCash(0.1 + 0.2), check: () => cashRegister.getOpenSession()?.openingCash },
  ];
  for (const { amount, apply, check } of cases) {
    reset();
    assert.deepEqual(apply(), { ok: true });
    assert.ok(Math.abs(check() - amount) < 1e-12);
    assert.equal(accounting.buildBalanceSheet().balanced, true);
  }
});
