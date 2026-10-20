import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(
  ts.transpileModule(fs.readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, path,
);
const recipes = require("../commerce-kit-recipes.ts");
const store = require("../store.ts");
const shop = require("../shop-profile.ts");
const permissions = require("../permissions.ts");

function product(id, price, overrides = {}) {
  return {
    id, name: "Camera kit " + id, sku: id, unit: "pcs",
    sellingPrice: price, costPrice: 200, stockQuantity: 99999,
    supplierId: "internal-supplier", notes: "internal-notes",
    categoryId: null, isActive: true, deletedAt: null, branchId: null, hasVariants: false,
    ...overrides,
  };
}
function setup(products = [product("p-a", 20.25), product("p-b", 3.50)]) {
  permissions.setCurrentRole("admin");
  permissions.setRuntimeFeaturePolicy(null);
  shop.hydrateShopProfile({ ...shop.getShopProfile(), shopName: "Minarva Shop", currency: "INR" });
  store.hydrateCore({ customers: [], categories: [], sales: [], payments: [], products });
  recipes.hydrateCommerceKitRecipes([]);
  return recipes.createCommerceKitRecipe({
    name: "Starter Kit",
    components: [
      { productId: "p-a", quantityMilliPerKit: 1000 },
      { productId: "p-b", quantityMilliPerKit: 2000 },
    ],
  });
}

test("seller exports deterministic itemized retail draft CSV; no cost, supplier or stock information", () => {
  const recipe = setup();
  const before = JSON.stringify({ store: store.exportCoreState(), drafts: recipes.exportCommerceKitRecipes() });
  const csv = recipes.exportCommerceKitEstimateCsv(recipe.id, recipe.version, 2);
  assert.match(csv, /^record,description,product_id,unit,quantity,unit_price,line_total,currency\n/);
  assert.match(csv, /seller,Minarva Shop/);
  assert.match(csv, /draft_kit_estimate,Starter Kit/);
  assert.match(csv, /component,Camera kit p-a,p-a,pcs,2,20\.25,40\.50,INR/);
  assert.match(csv, /component,Camera kit p-b,p-b,pcs,4,3\.50,14\.00,INR/);
  assert.match(csv, /estimate_total,NONBINDING - NOT AN INVOICE,,,2,,54\.50,INR/);
  assert.match(csv, /exact_per_kit,.*27\.25,INR/);
  assert.ok(csv.endsWith("\n"));
  for (const secret of ["internal-supplier", "internal-notes", "stockQuantity", "supplierId", "99999", "costPrice"]) {
    assert.equal(csv.includes(secret), false, "private catalog field leaked: " + secret);
  }
  assert.equal(JSON.stringify({ store: store.exportCoreState(), drafts: recipes.exportCommerceKitRecipes() }), before);
  assert.equal(recipes.exportCommerceKitEstimateCsv(recipe.id, recipe.version, 2), csv);
});

test("CSV output neutralizes spreadsheet formulas in SKU names, seller and recipe", () => {
  const dangerousProduct = '=HYPERLINK("https://malicious.invalid","click")';
  const recipe = setup([
    product("p-a", 2, { name: dangerousProduct }),
    product("p-b", 1, { name: " +CMD" }),
  ]);
  shop.hydrateShopProfile({ ...shop.getShopProfile(), shopName: "=1+1" });
  const next = recipes.updateCommerceKitRecipe(recipe.id, recipe.version, {
    name: "+FORMULA",
    components: recipe.components,
  });
  const csv = recipes.exportCommerceKitEstimateCsv(next.id, next.version, 1);
  assert.ok(csv.includes("'=1+1"), "seller name must be neutralized");
  assert.ok(csv.includes("'+FORMULA"), "recipe name must be neutralized");
  assert.ok(csv.includes('\'=HYPERLINK(""https://malicious.invalid"",""click"")'), "product name formula escaped and quoted");
  assert.ok(csv.includes("' +CMD"), "whitespace-prefixed formula neutralized");
});

test("stale recipe version and non-manager permissions fail closed", () => {
  const recipe = setup();
  assert.throws(() => recipes.exportCommerceKitEstimateCsv(recipe.id, recipe.version + 1, 1), /changed; reload/);
  permissions.setCurrentRole("staff");
  assert.throws(() => recipes.exportCommerceKitEstimateCsv(recipe.id, recipe.version, 1), /Permission denied/);
  permissions.setCurrentRole("admin");
  assert.throws(() => recipes.exportCommerceKitEstimateCsv("missing", 1, 1), /no longer exists/);
  assert.throws(() => recipes.exportCommerceKitEstimateCsv(recipe.id, recipe.version, 0), /Kit count/);
  assert.throws(() => recipes.exportCommerceKitEstimateCsv(recipe.id, recipe.version, 1.5), /Kit count/);
});

test("catalog changes update estimate; retired SKU blocks export", () => {
  const recipe = setup();
  store.hydrateCore({ customers: [], categories: [], sales: [], payments: [],
    products: [product("p-a", 30), product("p-b", 5)],
  });
  const updated = recipes.exportCommerceKitEstimateCsv(recipe.id, recipe.version, 1);
  assert.match(updated, /estimate_total,NONBINDING - NOT AN INVOICE,,,1,,40\.00,INR/);
  store.hydrateCore({ customers: [], categories: [], sales: [], payments: [],
    products: [product("p-a", 30, { deletedAt: "2026-10-01" }), product("p-b", 5)],
  });
  assert.throws(() => recipes.exportCommerceKitEstimateCsv(recipe.id, recipe.version, 1), /unavailable|no longer exists/);
});

test("Products UI offers manual seller-only download with safe MIME and no API publication", () => {
  const ui = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/products/kit-recipe-manager.tsx", import.meta.url), "utf8");
  assert.match(ui, /Download estimate CSV/);
  assert.match(ui, /exportCommerceKitEstimateCsv\(id, version, Number\(kitCount\.trim\(\)\)\)/);
  assert.match(ui, /minarvabiz-kit-estimate-draft\.csv/);
  assert.match(ui, /text\/csv;charset=utf-8/);
  assert.match(ui, /URL\.revokeObjectURL\(url\)/);
});
