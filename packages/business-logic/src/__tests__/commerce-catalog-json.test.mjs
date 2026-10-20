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

const { exportShareableCatalogJson, exportShareableCatalogCsv } = require("../commerce-catalog.ts");
const categories = [
  { id: "cat1", name: "Workwear", isActive: true, deletedAt: null },
  { id: "cat2", name: "SECRET INACTIVE CATEGORY", isActive: false, deletedAt: null },
];
const product = (changes = {}) => ({
  id: "prod-1", name: "Blue Uniform", sku: "UNIF-1", barcode: "01234",
  categoryId: "cat1", brand: "Workshop", size: "L", color: "Blue", fabric: "Cotton",
  unit: "pcs", sellingPrice: 25.5, costPrice: 12.4,
  stockQuantity: 654321, minimumStock: 4, supplierId: "supplier-private-value",
  notes: "private-internal-note", isActive: true, deletedAt: null,
  branchId: null, parentProductId: null, hasVariants: false, ...changes,
});

test("JSON catalog contains only stable allowlisted sellable fields and exact formatted prices", () => {
  const products = [
    product({ id: "prod-parent", name: "Parent", hasVariants: true }),
    product({ id: "prod-child", name: "Z Child", parentProductId: "prod-parent", size: "XL", sellingPrice: 12.35 }),
    product({ id: "prod-deleted", name: "REMOVED_PRODUCT", deletedAt: "2026-01-01" }),
    product({ id: "prod-disabled", name: "DISABLED_PRODUCT", isActive: false }),
    product({ id: "prod-foreign", name: "PRIVATE_BRANCH_PRODUCT", branchId: "b2" }),
    product({ id: "prod-categorized", name: "X No Category", categoryId: "cat2" }),
    product(),
  ];
  const before = JSON.stringify(products);
  const text = exportShareableCatalogJson(products, categories, "INR", { branchId: "b1" });
  assert.equal(JSON.stringify(products), before, "read-only projection");
  const data = JSON.parse(text);
  assert.deepEqual(Object.keys(data), ["schemaVersion", "kind", "currency", "products"]);
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.kind, "minarvabiz.public_catalog");
  assert.equal(data.currency, "INR");
  assert.deepEqual(data.products.map((item) => item.name), ["Blue Uniform", "X No Category", "Z Child"]);
  assert.deepEqual(data.products[0], {
    id: "prod-1", name: "Blue Uniform", sku: "UNIF-1", barcode: "01234",
    category: "Workwear", brand: "Workshop", size: "L", color: "Blue",
    fabric: "Cotton", unit: "pcs", unitPrice: "25.50",
  });
  assert.equal(data.products[1].category, "");
  assert.equal(data.products[2].unitPrice, "12.35");
  for (const secret of [
    "costPrice", "stockQuantity", "minimumStock", "supplierId", "notes",
    "supplier-private-value", "private-internal-note", "654321",
    "REMOVED_PRODUCT", "DISABLED_PRODUCT", "PRIVATE_BRANCH_PRODUCT", "SECRET INACTIVE CATEGORY",
  ]) assert.ok(!text.includes(secret), "private field escaped catalog boundary: " + secret);
  assert.equal(exportShareableCatalogJson(products, categories, "INR", { branchId: "b1" }), text);
  assert.ok(exportShareableCatalogCsv(products, categories, "INR", { branchId: "b1" }).includes("Blue Uniform"));
});

test("branch scope applies before variant selection; missing scope is company-only", () => {
  const products = [
    product({ id: "global", name: "Public Global" }),
    product({ id: "branch-1", name: "Seller B1", branchId: "b1" }),
    product({ id: "branch-2", name: "Seller B2", branchId: "b2" }),
  ];
  const global = JSON.parse(exportShareableCatalogJson(products, categories, "OMR"));
  assert.deepEqual(global.products.map(p => p.name), ["Public Global"]);
  const b1 = JSON.parse(exportShareableCatalogJson(products, categories, "OMR", { branchId: "b1" }));
  assert.deepEqual(b1.products.map(p => p.name), ["Public Global", "Seller B1"]);
  assert.throws(() => exportShareableCatalogJson(products, categories, "OMR", { branchId: " " }), /branch scope/);
});

test("JSON output escapes HTML control characters but round-trips original product text", () => {
  const raw = '<script src="evil"></script> & other';
  const json = exportShareableCatalogJson([product({ name: raw })], categories, "USD");
  assert.ok(!json.includes("<script"), "safe against accidental inline-script embedding");
  assert.ok(json.includes("\\u003c"), "encode less-than in JSON source");
  assert.equal(JSON.parse(json).products[0].name, raw);
});

test("catalog JSON fails closed on malformed prices and currency", () => {
  for (const price of [NaN, Infinity, -1, 1.005, 1.234, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => exportShareableCatalogJson([product({ sellingPrice: price })], categories, "INR"), /Invalid catalog unit price/);
  }
  assert.throws(() => exportShareableCatalogJson([], categories, "Rs"), /3-letter shop currency/);
  const empty = JSON.parse(exportShareableCatalogJson([], categories, "INR"));
  assert.deepEqual(empty.products, []);
});

test("seller's Products page exports JSON manually with explicit MIME and no network publish", () => {
  const ui = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/products/page.tsx", import.meta.url), "utf8");
  assert.match(ui, /exportShareableCatalogJson\(store\.listProducts\(\), store\.listCategories\(\), getShopProfile\(\)\.currency\)/);
  assert.match(ui, /Export headless catalog JSON/);
  assert.match(ui, /"application\/json;charset=utf-8"/);
  assert.match(ui, /"minarvabiz-headless-catalog\.json"/);
});
