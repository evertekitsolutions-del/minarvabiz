import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
const { exportShareableCatalogCsv } = require("../commerce-catalog.ts");

const base = (extra = {}) => ({
  id: "p1", name: "Cotton, Premium", sku: "COT-1", barcode: "123",
  categoryId: "cat1", brand: "Brand", size: null, color: "Blue",
  fabric: null, unit: "pcs", sellingPrice: 25.5, costPrice: 10,
  stockQuantity: 100, minimumStock: 1, supplierId: "secret",
  notes: "PRIVATE", isActive: true, deletedAt: null, branchId: null,
  parentProductId: null, hasVariants: false, ...extra,
});
const cats = [{ id: "cat1", name: "Clothing", isActive: true, deletedAt: null }];

test("shareable catalog exports active sellable variants only, no private stock or cost", () => {
  const rows = [
    base({ id: "parent", name: "T-shirt", hasVariants: true }),
    base({ id: "child", name: "T-shirt L", parentProductId: "parent", size: "L" }),
    base({ id: "archived", name: "Archived", deletedAt: "2026-01-01" }),
    base({ id: "disabled", name: "Disabled", isActive: false }),
    base({ id: "foreign", name: "Other branch", branchId: "branch-2" }),
    base({ id: "formula", name: ' =HYPERLINK("https://invalid.example")', sku: "@SKU" }),
    base(),
  ];
  const before = JSON.stringify(rows);
  const csv = exportShareableCatalogCsv(rows, cats, "OMR", { branchId: "branch-1" });
  assert.equal(JSON.stringify(rows), before, "read-only export");
  assert.match(csv, /^name,sku,barcode,category,brand,size,color,fabric,unit,unit_price,currency\n/);
  assert.match(csv, /T-shirt L,COT-1,123,Clothing,Brand,L,Blue,,pcs,25\.50,OMR/);
  assert.match(csv, /"' =HYPERLINK\(""https:\/\/invalid\.example""\)"/);
  assert.ok(csv.includes("'@SKU"), "formula-like SKUs are inert");
  for (const privateValue of ["PRIVATE", "secret", "100", "Archived", "Disabled", "Other branch", "T-shirt,"]) {
    assert.ok(!csv.includes(privateValue), "no leaked field or unsellable product: " + privateValue);
  }
});

test("fail closed on invalid prices and currency; no silently rounded accounting", () => {
  for (const sellingPrice of [NaN, Infinity, -1, 1.234, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => exportShareableCatalogCsv([base({ sellingPrice })], cats, "INR"), /Invalid catalog unit price/);
  }
  assert.throws(() => exportShareableCatalogCsv([base()], cats, "₹"), /3-letter shop currency/);
  assert.equal(exportShareableCatalogCsv([], cats, "USD"),
    "name,sku,barcode,category,brand,size,color,fabric,unit,unit_price,currency\n");
});

test("seller CSV button uses existing authorized product view and configured shop currency", () => {
  const page = fs.readFileSync(
    new URL("../../../../apps/web/src/app/(app)/products/page.tsx", import.meta.url), "utf8"
  );
  assert.match(page, /exportShareableCatalogCsv\(store\.listProducts\(\), store\.listCategories\(\), getShopProfile\(\)\.currency\)/);
  assert.match(page, /Export shareable catalog CSV/);
});
