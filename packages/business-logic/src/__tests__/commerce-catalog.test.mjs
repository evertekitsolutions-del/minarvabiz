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

test("unscoped catalog exports only company-wide SKUs; branch scope is fail-closed", () => {
  const rows = [
    base({ id: "global", name: "Company-wide" }),
    base({ id: "branch1", name: "BRANCH ONE PRIVATE", branchId: "b1" }),
    base({ id: "branch2", name: "BRANCH TWO PRIVATE", branchId: "b2" }),
  ];
  const global = exportShareableCatalogCsv(rows, cats, "INR");
  assert.match(global, /Company-wide/);
  assert.doesNotMatch(global, /BRANCH (ONE|TWO) PRIVATE/);
  const selected = exportShareableCatalogCsv(rows, cats, "INR", { branchId: "b1" });
  assert.match(selected, /BRANCH ONE PRIVATE/);
  assert.doesNotMatch(selected, /BRANCH TWO PRIVATE/);
  assert.throws(() => exportShareableCatalogCsv(rows, cats, "INR", { branchId: " " }), /branch scope/);
});

test("standalone customer HTML escapes XSS and never serializes financial or inventory secrets", () => {
  const { exportShareableCatalogHtml } = require("../commerce-catalog.ts");
  const rows = [
    base({
      name: '<img src=x onerror="alert(1)">', sku: "</script><script>evil()</script>",
      brand: "<svg/onload=evil()>", costPrice: 999, stockQuantity: 456,
      notes: "INTERNAL CONFIDENTIAL", supplierId: "supplier-private",
    }),
    base({ id: "b2", name: "PRIVATE-BRANCH", branchId: "b2" }),
    base({ id: "deleted", name: "ARCHIVED-SKU", deletedAt: "2026-10-01" }),
  ];
  const before = JSON.stringify(rows);
  const html = exportShareableCatalogHtml(rows, cats, "OMR", "<script>alert(1)</script>");
  assert.equal(JSON.stringify(rows), before, "no product mutation");
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /&lt;svg\/onload=evil\(\)&gt;/);
  assert.match(html, /OMR 25\.50/);
  assert.doesNotMatch(html, /<script|<img|<svg|INTERNAL CONFIDENTIAL|supplier-private|PRIVATE-BRANCH|ARCHIVED-SKU|456|999/i);
  assert.match(html, /confirm availability/);
});

test("HTML catalog has the same cent-precision guard as the CSV", () => {
  const { exportShareableCatalogHtml } = require("../commerce-catalog.ts");
  assert.throws(() => exportShareableCatalogHtml([base({ sellingPrice: 1.235 })], cats, "USD", "Shop"), /Invalid catalog unit price/);
  assert.throws(() => exportShareableCatalogHtml([base()], cats, "usd", "Shop"), /3-letter shop currency/);
  assert.match(exportShareableCatalogHtml([], cats, "USD", "Shop"), /No company-wide products/);
});

test("products UI exposes deliberate offline HTML download with an explicit MIME", () => {
  const page = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/products/page.tsx", import.meta.url), "utf8");
  assert.match(page, /exportShareableCatalogHtml\(store\.listProducts\(\), store\.listCategories\(\), shop\.currency, shop\.shopName\)/);
  assert.match(page, /Download customer catalog HTML/);
  assert.match(page, /"text\/html;charset=utf-8"/);
});
