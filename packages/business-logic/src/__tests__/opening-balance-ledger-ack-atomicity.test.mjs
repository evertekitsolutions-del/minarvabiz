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
const opening = require("../opening-balances.ts");
const customers = require("../store.ts");
const suppliers = require("../phase5-store.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
const originalAccounts = accounting.exportAccountingState().accounts;

function reset() {
  accounting.hydrateAccountingState({ accounts: originalAccounts, journals: [], journalSequence: 0 });
  customers.hydrateCore({ customers: [
    { id: "customer", name: "Receipt customer", outstandingBalance: 40,
      totalSpending: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
  ], products: [], sales: [], payments: [] });
  suppliers.hydratePhase5({ suppliers: [
    { id: "supplier", name: "Payable supplier", openingBalance: 0,
      outstandingBalance: 50, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
  ], purchases: [], expenses: [], laundryOrders: [], expenseCategories: [] });
  outbox.hydrateOutbox([]);
}
const snapshot = () => JSON.stringify({
  customer: customers.getCustomer("customer"),
  supplier: suppliers.getSupplier("supplier"),
  ledger: accounting.exportAccountingState(),
  outbox: outbox.exportOutbox(),
});
const apply = [
  { name: "customer", save: () => opening.setOpeningCustomerBalance("customer", 55) },
  { name: "supplier", save: () => opening.setOpeningSupplierBalance("supplier", 75) },
];

test("failed accounting commit returns an error without changing either opening master", () => {
  const original = accounting.planAutomaticPosting;
  try {
    accounting.planAutomaticPosting = () => ({ errors: [], commit: () => null });
    for (const { name, save } of apply) {
      reset();
      const before = snapshot();
      const result = save();
      assert.equal(result.ok, false, name);
      assert.match(result.error, /journal posting did not complete/i);
      assert.equal(snapshot(), before, name + " must retain live balance, ledger and outbox");
    }
  } finally {
    accounting.planAutomaticPosting = original;
  }
});

test("thrown accounting commit never changes customer or supplier", () => {
  const original = accounting.planAutomaticPosting;
  try {
    accounting.planAutomaticPosting = () => ({ errors: [], commit: () => { throw Error("journal unavailable"); } });
    for (const { name, save } of apply) {
      reset();
      const before = snapshot();
      assert.throws(save, /journal unavailable/, name);
      assert.equal(snapshot(), before, name + " must not drift on throw");
    }
  } finally {
    accounting.planAutomaticPosting = original;
  }
});

test("successful source posting still updates both balances with balanced journals", () => {
  for (const { name, save } of apply) {
    reset();
    assert.deepEqual(save(), { ok: true }, name);
    assert.equal(accounting.listJournalEntries().length, 1);
    assert.equal(accounting.buildBalanceSheet().balanced, true);
    assert.equal(name === "customer"
      ? customers.getCustomer("customer").outstandingBalance
      : suppliers.getSupplier("supplier").outstandingBalance,
      name === "customer" ? 55 : 75);
  }
});
