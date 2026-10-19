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
const csv = require("../csv-import.ts");
const store = require("../store.ts");
const vendors = require("../phase5-store.ts");
const outbox = require("../outbox-bridge.ts");
const accounts = require("../accounting-store.ts");
const permissions = require("../permissions.ts");
permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);

function reset() {
  store.hydrateCore({ customers: [], products: [], categories: [], sales: [], payments: [] });
  vendors.hydratePhase5({
    suppliers: [], laundryOrders: [], expenses: [], purchases: [], expenseCategories: [],
  });
  outbox.hydrateOutbox([]);
}
function state() {
  return JSON.stringify({
    customers: store.listCustomers(),
    products: store.listProducts(),
    suppliers: vendors.exportPhase5State().suppliers,
    outbox: outbox.exportOutbox(),
    accounting: accounts.exportAccountingState(),
  });
}

const importers = [
  {
    name: "product",
    header: "name,sku",
    first: "Safe Item,SAFE-01",
    tail: "SKU-02",
    preview: csv.parseProductCsv,
    importCsv: csv.importProductsFromCsv,
  },
  {
    name: "customer",
    header: "name,phone",
    first: "Safe Customer,1234567890",
    tail: "19876543210",
    preview: csv.parseCustomerCsv,
    importCsv: csv.importCustomersFromCsv,
  },
  {
    name: "supplier",
    header: "name,company",
    first: "Safe Supplier,First Company",
    tail: "Second Company",
    preview: csv.parseSupplierCsv,
    importCsv: csv.importSuppliersFromCsv,
  },
];

for (const surface of importers) {
  test(`${surface.name} onboarding refuses malformed quoted fields without writing earlier valid rows`, () => {
    reset();
    for (const malformedName of [
      '"Bad"TRAIL',
      'Bad"TRAIL"',
      '"Bad" "TRAIL"',
    ]) {
      const source = surface.header + "\n" + surface.first + "\n" +
        malformedName + "," + surface.tail;
      const before = state();
      const preview = surface.preview(source);
      assert.ok(preview.errors.length > 0, source);
      const imported = surface.importCsv(source);
      assert.equal(imported.created, 0, source);
      assert.ok(imported.errors.length > 0, source);
      assert.equal(state(), before, "failed import must preserve master records, outbox and journals");
    }
  });

  test(`${surface.name} onboarding still accepts escaped double quotes and commas`, () => {
    reset();
    const source = surface.header + '\n"Quoted ""Item"", Ltd",' + surface.tail;
    const before = state();
    const preview = surface.preview(source);
    assert.deepEqual(preview.errors, [], JSON.stringify(preview.errors));
    assert.equal(preview.rows.length, 1);
    assert.equal(preview.rows[0].name, 'Quoted "Item", Ltd');
    assert.equal(state(), before, "preview cannot perform a write");
    assert.deepEqual(surface.importCsv(source), { created: 1, errors: [] });
  });
}
