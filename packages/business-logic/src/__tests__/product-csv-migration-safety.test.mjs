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

const csv = require("../csv-import.ts");
const store = require("../store.ts");
const permissions = require("../permissions.ts");

permissions.setCurrentRole("admin");
store.hydrateCore({
  customers: [],
  products: [],
  categories: [],
  sales: [],
  payments: [],
  stockTransfers: [],
  heldSales: [],
});

const quoted = [
  "name,sku,barcode,cost,price,stock,min,unit",
  '"Silk, Premium","SKU-1","8901",10,20,2,1,pcs',
].join("\n");
const parsed = csv.parseProductCsv(quoted);
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.rows[0].name, "Silk, Premium");
assert.equal(parsed.rows[0].sku, "SKU-1");

const imported = csv.importProductsFromCsv(quoted);
assert.equal(imported.created, 1);
assert.deepEqual(imported.errors, []);
assert.equal(store.listProducts()[0].name, "Silk, Premium");

const exported = csv.exportProductsCsv();
assert.match(exported, /"Silk, Premium"/);
assert.match(exported, /SKU-1/);

const duplicate = csv.importProductsFromCsv([
  "name,sku,barcode,cost,price,stock,min,unit",
  "Other,SKU-1,9999,1,2,0,0,pcs",
].join("\n"));
assert.equal(duplicate.created, 0);
assert.match(duplicate.errors.join(" "), /already exists/i);
assert.equal(store.listProducts().length, 1);

const invalid = csv.importProductsFromCsv([
  "name,sku,barcode,cost,price,stock,min,unit",
  "Bad,SKU-2,9000,-1,2,0,0,pcs",
].join("\n"));
assert.equal(invalid.created, 0);
assert.match(invalid.errors.join(" "), /non-negative/i);
assert.equal(store.listProducts().length, 1);

const before = store.listProducts().map((p) => p.id);
const partialFailure = csv.importProductsFromCsv([
  "name,sku,barcode,cost,price,stock,min,unit",
  "Safe row,SKU-3,9001,1,2,0,0,pcs",
  "Unsafe row,SKU-4,9002,1,2,100000000000000000000,0,pcs",
].join("\n"));
assert.equal(partialFailure.created, 0);
assert.match(partialFailure.errors.join(" "), /rolled back safely/i);
assert.deepEqual(store.listProducts().map((p) => p.id), before, "failed batch must not leave partially imported products");

permissions.setCurrentRole(null);
console.log("Product CSV migration safety PASS");
