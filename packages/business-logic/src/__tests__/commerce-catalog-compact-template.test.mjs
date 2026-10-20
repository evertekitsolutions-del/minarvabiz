import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, file,
);

const { exportShareableCatalogHtml } = require("../commerce-catalog.ts");

const base = (changes = {}) => ({
  id: "p", name: "Workwear", sku: "WORK-1", barcode: "0011",
  categoryId: "c", brand: "Maker", size: "L", color: "Navy", fabric: "Cotton",
  unit: "pcs", sellingPrice: 25.5, costPrice: 4321, stockQuantity: 67890,
  supplierId: "private-supplier", notes: "internal-only", isActive: true,
  deletedAt: null, branchId: null, parentProductId: null, hasVariants: false,
  ...changes,
});
const categories = [{ id: "c", name: "Uniforms", isActive: true, deletedAt: null }];
const data = [
  base(), base({ id: "foreign", name: "PRIVATE_BRANCH_PRODUCT", branchId: "branch2" }),
  base({ id: "disabled", name: "DISABLED_PRODUCT", isActive: false }),
];

test("built-in compact template changes presentation only, not sellable projection", () => {
  const saved = JSON.stringify(data);
  const defaultHtml = exportShareableCatalogHtml(data, categories, "INR", "Shop");
  const explicitCards = exportShareableCatalogHtml(data, categories, "INR", "Shop", { template: "cards" });
  const compact = exportShareableCatalogHtml(data, categories, "INR", "Shop", { template: "compact" });
  assert.equal(defaultHtml, explicitCards, "existing default catalog stays stable");
  assert.match(compact, /class="grid catalog-compact"/);
  assert.match(compact, /grid-template-columns:minmax\(0,1fr\)/);
  assert.doesNotMatch(defaultHtml, /catalog-compact/);
  for (const html of [defaultHtml, compact]) {
    assert.match(html, /Workwear/);
    assert.match(html, /INR 25\.50/);
    assert.match(html, /Content-Security-Policy/);
    for (const secret of ["private-supplier", "internal-only", "67890", "4321", "PRIVATE_BRANCH_PRODUCT", "DISABLED_PRODUCT"]) {
      assert.ok(!html.includes(secret), secret + " must not escape through a template");
    }
  }
  assert.equal(JSON.stringify(data), saved, "export has no business mutation");
});

test("compact catalog preserves HTML escaping and branch isolation", () => {
  const dangerous = '<img src=x onerror="alert(1)">';
  const html = exportShareableCatalogHtml([
    base({ id: "special", name: dangerous }),
    base({ id: "only-b1", name: "Seller branch product", branchId: "b1" }),
    base({ id: "only-b2", name: "Another branch product", branchId: "b2" }),
  ], categories, "USD", "<script>alert(1)</script>", { template: "compact", branchId: "b1" });
  assert.match(html, /&lt;img src=x onerror=/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|<img|Another branch product/);
  assert.match(html, /Seller branch product/);
  assert.match(html, /catalog-compact/);
});

test("unknown template and malformed branch/currency fail closed", () => {
  assert.throws(() => exportShareableCatalogHtml(data, categories, "INR", "Shop", { template: "javascript:" }), /Unsupported catalog HTML template/);
  assert.throws(() => exportShareableCatalogHtml(data, categories, "INR", "Shop", { template: "compact", branchId: " " }), /branch scope/);
  assert.throws(() => exportShareableCatalogHtml(data, categories, "inr", "Shop", { template: "compact" }), /3-letter shop currency/);
});

test("products UI exposes deliberate compact HTML download with correct MIME", () => {
  const page = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/products/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Download compact catalog HTML/);
  assert.match(page, /template: "compact"/);
  assert.match(page, /minarvabiz-customer-catalog-compact\.html/);
  assert.match(page, /"text\/html;charset=utf-8"/);
});
