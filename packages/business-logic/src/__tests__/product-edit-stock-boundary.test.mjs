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
store.hydrateCore({ customers: [], products: [], sales: [], payments: [] });
outbox.hydrateOutbox([]);

const product = store.createProduct({
  name: "Edit Guard Product",
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
  costPrice: 10,
  sellingPrice: 15,
  discount: 0,
  taxRate: 0,
  stockQuantity: 4,
  minimumStock: 1,
  supplierId: null,
  imageUrl: null,
  notes: null,
  isActive: true,
  branchId: null,
});
outbox.hydrateOutbox([]);

const before = JSON.stringify(store.getProduct(product.id));
assert.throws(
  () => store.updateProduct(product.id, { stockQuantity: 9 }),
  /stock quantity must be changed through inventory adjustment/i
);
assert.equal(JSON.stringify(store.getProduct(product.id)), before);
assert.equal(outbox.exportOutbox().length, 0);

const sameStock = store.updateProduct(product.id, { name: "Renamed Product", stockQuantity: 4 });
assert.equal(sameStock.name, "Renamed Product");
assert.equal(sameStock.stockQuantity, 4);

const web = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/products/page.tsx", import.meta.url), "utf8");
assert.match(web, /const patch: Partial<Product> = \{ \.\.\.parsed\.data \};[\s\S]*delete patch\.stockQuantity;[\s\S]*store\.updateProduct\(editingId, patch\)/);
assert.match(web, /disabled=\{!!editingId\}/);
assert.match(web, /Stock qty \(use Adjust Stock\)/);

const desktop = fs.readFileSync(new URL("../../../../apps/desktop/src/App.tsx", import.meta.url), "utf8");
assert.match(desktop, /const patch:Partial<Product>=\{\.\.\.payload\};delete patch\.stockQuantity;store\.updateProduct\(editingProductId,patch\)/);
assert.match(desktop, /disabled=\{!!editingProductId\}/);
assert.match(desktop, /Stock \(use Adjust Stock\)/);

console.log("Product edit stock-bypass guard tests passed");
