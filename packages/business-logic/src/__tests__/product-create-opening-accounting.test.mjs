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

const store = require("../store.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);

const chart = accounting.exportAccountingState().accounts;

function reset(accounts = chart) {
  accounting.hydrateAccountingState({ accounts, journals: [], journalSequence: 0 });
  store.hydrateCore({ customers: [], products: [], sales: [], payments: [] });
  outbox.hydrateOutbox([]);
}

function product(overrides = {}) {
  return {
    name: "Opening Stock Product",
    sku: null,
    barcode: null,
    categoryId: null,
    brand: null,
    size: null,
    color: null,
    fabric: null,
    parentProductId: null,
    hasVariants: false,
    unit: "pcs",
    costPrice: 12.5,
    sellingPrice: 20,
    discount: 0,
    taxRate: 0,
    stockQuantity: 5,
    minimumStock: 1,
    supplierId: null,
    imageUrl: null,
    notes: null,
    isActive: true,
    branchId: null,
    ...overrides,
  };
}

function balance(systemKey) {
  const account = accounting.getSystemAccount(systemKey);
  const row = accounting.buildTrialBalance().find((item) => item.accountId === account?.id);
  return Math.round(((row?.debit ?? 0) - (row?.credit ?? 0)) * 100) / 100;
}

reset();
const created = store.createProduct(product());
assert.equal(created.stockQuantity, 5);
assert.equal(balance("inventory_asset"), 62.5);
assert.equal(balance("opening_balance_equity"), -62.5);
assert.equal(
  accounting.listJournalEntries().filter((entry) => entry.referenceType === "auto_opening_stock" && entry.referenceId === "opening-stock-" + created.id + "-create").length,
  1
);
assert.ok(accounting.buildBalanceSheet().balanced);
for (const type of ["products", "accounts", "journal_entries", "journal_entry_lines"]) {
  assert.ok(outbox.listPendingOutbox().some((entry) => entry.aggregateType === type), type);
}

reset();
const zero = store.createProduct(product({ stockQuantity: 0 }));
assert.equal(zero.stockQuantity, 0);
assert.equal(accounting.listJournalEntries().length, 0);

reset();
const free = store.createProduct(product({ stockQuantity: 2, costPrice: 0 }));
assert.equal(free.stockQuantity, 2);
assert.equal(accounting.listJournalEntries().length, 0);

for (const invalid of [-1, 1e30]) {
  reset();
  assert.throws(
    () => store.createProduct(product({ stockQuantity: invalid })),
    /Opening stock quantity|Opening stock value/i
  );
  assert.equal(store.listProducts().length, 0);
  assert.equal(accounting.listJournalEntries().length, 0);
  assert.equal(outbox.exportOutbox().length, 0);
}

reset();
assert.throws(
  () => store.createProduct(product({ stockQuantity: 2, costPrice: -1 })),
  /Product cost must be a finite non-negative amount for opening stock/
);
assert.equal(store.listProducts().length, 0);
assert.equal(accounting.listJournalEntries().length, 0);
assert.equal(outbox.exportOutbox().length, 0);

reset(chart.map((account) => account.systemKey === "inventory_asset" ? { ...account, isActive: false } : account));
assert.throws(
  () => store.createProduct(product({ stockQuantity: 2 })),
  /Posting account unavailable: Inventory Asset/
);
assert.equal(store.listProducts().length, 0);
assert.equal(accounting.listJournalEntries().length, 0);
assert.equal(outbox.exportOutbox().length, 0);

reset();
permissions.setCurrentRole("cashier");
assert.throws(
  () => store.createProduct(product({ stockQuantity: 2 })),
  /denied/i
);
permissions.setCurrentRole("admin");

console.log("Product opening-stock creation accounting tests passed");
