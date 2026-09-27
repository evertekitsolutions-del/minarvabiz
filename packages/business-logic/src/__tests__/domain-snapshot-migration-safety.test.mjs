import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );

const persistence = require("../persistence.ts");
const store = require("../store.ts");

const originalCustomer = {
  id: "customer-original",
  name: "Original Customer",
  phone: "9999999999",
  email: null,
  address: null,
  gstin: null,
  loyaltyPoints: 0,
  totalPurchases: 0,
  isActive: true,
  createdAt: "2026-09-27T00:00:00.000Z",
  updatedAt: "2026-09-27T00:00:00.000Z",
  deletedAt: null,
  version: 1,
};

store.hydrateCore({
  customers: [originalCustomer],
  products: [],
  categories: [],
  sales: [],
  payments: [],
  stockTransfers: [],
  heldSales: [],
});

const malformed = persistence.validateDomainSnapshot({
  version: 12,
  exportedAt: "2026-09-27T00:00:00.000Z",
  customers: {},
  products: [],
});
assert.equal(malformed.ok, false);
assert.match(malformed.error, /customers.*array/i);
assert.equal(store.listCustomers()[0].name, "Original Customer");

const baseline = persistence.exportDomainSnapshotFull();
const brokenAfterPartialApply = {
  ...baseline,
  customers: [{ ...originalCustomer, id: "customer-incoming", name: "Incoming Customer" }],
  phase10: {
    productionWorkflows: [null],
    materialRolls: [],
    materialConsumptions: [],
  },
};

const failed = persistence.importDomainSnapshot(brokenAfterPartialApply);
assert.equal(failed.ok, false);
assert.match(failed.error, /rolled back safely/i);
assert.deepEqual(
  store.listCustomers().map((x) => ({ id: x.id, name: x.name })),
  [{ id: "customer-original", name: "Original Customer" }],
  "failed import must restore the full prior core state",
);

const legacy = {
  version: 1,
  exportedAt: "2020-01-01T00:00:00.000Z",
  customers: [],
  products: [],
  categories: [],
  sales: [],
  payments: [],
};
const legacyResult = persistence.importDomainSnapshot(legacy);
assert.equal(legacyResult.ok, true);
assert.equal(legacyResult.counts.orders, 0);
assert.equal(legacyResult.counts.staff, 0);
assert.deepEqual(store.listCustomers(), []);

const unsupported = persistence.importDomainSnapshot({ version: 999 });
assert.equal(unsupported.ok, false);
assert.match(unsupported.error, /Unsupported snapshot version/);

console.log("Domain snapshot migration validation and rollback PASS");
