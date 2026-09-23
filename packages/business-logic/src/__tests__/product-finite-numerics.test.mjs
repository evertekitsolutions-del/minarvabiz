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
const permissions = require("../permissions.ts");
const outbox = require("../outbox-bridge.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);

function reset() {
  store.hydrateCore({ customers: [], products: [], sales: [], payments: [] });
  outbox.hydrateOutbox([]);
}

function validProduct(overrides = {}) {
  return {
    name: "Finite Product",
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
    taxRate: 5,
    stockQuantity: 3,
    minimumStock: 1,
    supplierId: null,
    imageUrl: null,
    notes: null,
    isActive: true,
    branchId: null,
    ...overrides,
  };
}

for (const field of ["costPrice", "sellingPrice", "discount", "taxRate", "stockQuantity", "minimumStock"]) {
  for (const invalid of [NaN, Infinity, -Infinity]) {
    reset();
    assert.throws(
      () => store.createProduct(validProduct({ [field]: invalid })),
      new RegExp("Product " + field + " must be a finite number")
    );
    assert.equal(store.listProducts().length, 0, field + " create must not mutate products");
    assert.equal(outbox.exportOutbox().length, 0, field + " create must not enqueue remote writes");
  }
}

reset();
const created = store.createProduct(validProduct());
assert.equal(created.costPrice, 12.5);
assert.equal(store.listProducts().length, 1);

for (const field of ["costPrice", "sellingPrice", "discount", "taxRate", "stockQuantity", "minimumStock"]) {
  for (const invalid of [NaN, Infinity, -Infinity]) {
    const before = JSON.stringify(store.getProduct(created.id));
    assert.throws(
      () => store.updateProduct(created.id, { [field]: invalid }),
      new RegExp("Product " + field + " must be a finite number")
    );
    assert.equal(JSON.stringify(store.getProduct(created.id)), before, field + " update must not mutate product");
  }
}

const finiteUpdate = store.updateProduct(created.id, { costPrice: -1, stockQuantity: -2, taxRate: -5 });
assert.equal(finiteUpdate.costPrice, -1);
assert.equal(finiteUpdate.stockQuantity, -2);
assert.equal(finiteUpdate.taxRate, -5);

console.log("Product master finite-numeric mutation tests passed");
