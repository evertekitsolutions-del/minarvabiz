import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const permissions = require("../permissions.ts");
const store = require("../store.ts");
const phase5 = require("../phase5-store.ts");

permissions.setCurrentRole("admin");

store.hydrateCore({
  customers: [
    {
      id: "cust-zero", name: "Zero Balance", phone: "111", email: null, address: null, notes: null,
      outstandingBalance: 0, totalSpending: 500, createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z", deletedAt: null, version: 1,
    },
    {
      id: "cust-due", name: "Outstanding", phone: "222", email: null, address: null, notes: null,
      outstandingBalance: 125, totalSpending: 1000, createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z", deletedAt: null, version: 1,
    },
  ],
});

const updatedCustomer = store.updateCustomer("cust-zero", {
  name: "Edited Customer",
  outstandingBalance: 999,
  totalSpending: 999,
  deletedAt: "2000-01-01T00:00:00.000Z",
});
assert.equal(updatedCustomer.name, "Edited Customer");
assert.equal(updatedCustomer.outstandingBalance, 0, "Customer edit must not overwrite accounting balance");
assert.equal(updatedCustomer.totalSpending, 500, "Customer edit must not overwrite lifetime spending");
assert.equal(updatedCustomer.deletedAt, null, "Customer edit must not archive via patch");

assert.match(store.archiveCustomer("cust-zero", "").error, /reason is required/i);
assert.match(store.archiveCustomer("cust-due", "Duplicate record").error, /outstanding balance/i);
const archivedCustomer = store.archiveCustomer("cust-zero", "Duplicate record");
assert.ok(archivedCustomer.customer?.deletedAt);
assert.equal(store.getCustomer("cust-zero"), undefined);

phase5.hydratePhase5({
  suppliers: [
    {
      id: "sup-zero", name: "Zero Supplier", company: null, phone: null, email: null, address: null,
      category: "materials", openingBalance: 200, outstandingBalance: 0, notes: null,
      createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", deletedAt: null,
    },
    {
      id: "sup-due", name: "Due Supplier", company: null, phone: null, email: null, address: null,
      category: "materials", openingBalance: 200, outstandingBalance: 75, notes: null,
      createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", deletedAt: null,
    },
  ],
  laundryOrders: [],
  expenses: [],
  purchases: [],
  expenseCategories: [],
});

const updatedSupplier = phase5.updateSupplier("sup-zero", {
  name: "Edited Supplier",
  openingBalance: 999,
  outstandingBalance: 999,
  deletedAt: "2000-01-01T00:00:00.000Z",
});
assert.equal(updatedSupplier.name, "Edited Supplier");
assert.equal(updatedSupplier.openingBalance, 200, "Supplier edit must not rewrite opening accounting");
assert.equal(updatedSupplier.outstandingBalance, 0, "Supplier edit must not overwrite AP balance");
assert.equal(updatedSupplier.deletedAt, null, "Supplier edit must not archive via patch");

assert.match(phase5.archiveSupplier("sup-zero", "").error, /reason is required/i);
assert.match(phase5.archiveSupplier("sup-due", "No longer used").error, /outstanding balance/i);
const archivedSupplier = phase5.archiveSupplier("sup-zero", "No longer used");
assert.ok(archivedSupplier.supplier?.deletedAt);
assert.equal(phase5.getSupplier("sup-zero"), undefined);

console.log("Customer/supplier master controls PASS");
