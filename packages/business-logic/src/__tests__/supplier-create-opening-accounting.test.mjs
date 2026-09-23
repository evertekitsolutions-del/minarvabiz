import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText,
  filename
);

const suppliers = require("../phase5-store.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);

const chart = accounting.exportAccountingState().accounts;

function reset(accounts = chart) {
  accounting.hydrateAccountingState({ accounts, journals: [], journalSequence: 0 });
  suppliers.hydratePhase5({ suppliers: [], laundryOrders: [], expenses: [], purchases: [] });
  outbox.hydrateOutbox([]);
}

function balance(systemKey) {
  const account = accounting.getSystemAccount(systemKey);
  const row = accounting.buildTrialBalance().find((item) => item.accountId === account?.id);
  return Math.round(((row?.debit ?? 0) - (row?.credit ?? 0)) * 100) / 100;
}

reset();
const supplier = suppliers.createSupplier({ name: "Opening Vendor", openingBalance: 300.75 });
assert.equal(supplier.openingBalance, 300.75);
assert.equal(supplier.outstandingBalance, 300.75);
assert.equal(suppliers.getSupplier(supplier.id).outstandingBalance, 300.75);
assert.equal(balance("accounts_payable"), -300.75);
assert.equal(balance("opening_balance_equity"), 300.75);
assert.equal(accounting.listJournalEntries().filter((entry) => entry.referenceType === "auto_opening_supplier").length, 1);
assert.ok(accounting.buildBalanceSheet().balanced);

const payment = suppliers.recordSupplierPayment({
  supplierId: supplier.id,
  amount: 300.75,
  paymentMethod: "cash",
  date: "2026-09-23",
});
assert.deepEqual(payment.errors, []);
assert.equal(payment.supplier.outstandingBalance, 0);
assert.equal(balance("accounts_payable"), 0);
assert.equal(balance("legacy_settlement_clearing"), 0);
assert.equal(balance("cash"), -300.75);
assert.ok(accounting.buildBalanceSheet().balanced);

reset();
const zero = suppliers.createSupplier({ name: "Zero Vendor", openingBalance: 0 });
assert.equal(zero.outstandingBalance, 0);
assert.equal(accounting.listJournalEntries().length, 0);

for (const amount of [NaN, Infinity, -Infinity, -1, 1e30]) {
  reset();
  assert.throws(
    () => suppliers.createSupplier({ name: "Invalid Vendor", openingBalance: amount }),
    /Opening supplier balance|automatic posting amount/i
  );
  assert.equal(suppliers.listSuppliers().length, 0);
  assert.equal(accounting.listJournalEntries().length, 0);
}

reset(chart.map((account) => account.systemKey === "accounts_payable" ? { ...account, isActive: false } : account));
assert.throws(
  () => suppliers.createSupplier({ name: "Blocked Vendor", openingBalance: 10 }),
  /Posting account unavailable/i
);
assert.equal(suppliers.listSuppliers().length, 0);
assert.equal(accounting.listJournalEntries().length, 0);

console.log("Supplier creation opening-balance accounting tests passed");
