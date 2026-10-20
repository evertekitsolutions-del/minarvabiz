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

const { parseCommerceKitRecipeRows } = require("../commerce-kit-recipe-input.ts");
const kitRecipes = require("../commerce-kit-recipes.ts");
const products = require("../store.ts");
const permissions = require("../permissions.ts");

const row = (quantityPerKit = "1.25", productId = "sku-1") => ({ productId, quantityPerKit });
function setup() {
  permissions.setCurrentRole("admin");
  permissions.setRuntimeFeaturePolicy(null);
  products.hydrateCore({
    customers: [], categories: [], sales: [], payments: [],
    products: [
      { id: "sku-1", name: "Kit component 1", sku: "ONE", sellingPrice: 5, costPrice: 2, stockQuantity: 25, minimumStock: 0, unit: "pcs", isActive: true, deletedAt: null, branchId: null, hasVariants: false },
      { id: "sku-2", name: "Kit component 2", sku: "TWO", sellingPrice: 10, costPrice: 3, stockQuantity: 30, minimumStock: 0, unit: "pcs", isActive: true, deletedAt: null, branchId: null, hasVariants: false },
    ],
  });
  kitRecipes.hydrateCommerceKitRecipes([]);
}

test("exact text quantities become integer milli units; duplicate SKUs are allowed for domain aggregation", () => {
  const before = [row("0.001"), row(" 1.25 ", "sku-2"), row("2.500")];
  const saved = JSON.stringify(before);
  assert.deepEqual(parseCommerceKitRecipeRows(before), [
    { productId: "sku-1", quantityMilliPerKit: 1 },
    { productId: "sku-2", quantityMilliPerKit: 1250 },
    { productId: "sku-1", quantityMilliPerKit: 2500 },
  ]);
  assert.equal(JSON.stringify(before), saved);
});

test("imprecise, empty or malformed quantities do not silently round into recipes", () => {
  for (const qty of ["", "0", "0.000", "-1", "1e3", "+1", "1.", ".5", "NaN", "Infinity", "1.0001", "1.2345", "90071992547409999"]) {
    assert.throws(() => parseCommerceKitRecipeRows([row(qty)]), /Kit component 1 quantity/);
  }
  assert.throws(() => parseCommerceKitRecipeRows([row("1", " ") ]), /valid product/);
  assert.throws(() => parseCommerceKitRecipeRows([row("1", " sku-1")]), /valid product/);
  assert.throws(() => parseCommerceKitRecipeRows([]), /1 to 100/);
  assert.throws(() => parseCommerceKitRecipeRows(Array.from({ length: 101 }, () => row("1"))), /1 to 100/);
});

test("real kit recipe domain accepts parsed form and aggregates duplicate SKUs safely", () => {
  setup();
  const before = JSON.stringify(products.exportCoreState());
  const recipe = kitRecipes.createCommerceKitRecipe({
    name: "CCTV camera starter bundle",
    components: parseCommerceKitRecipeRows([row("1.5"), row("0.5"), row("2", "sku-2")]),
  });
  assert.deepEqual(recipe.components, [
    { productId: "sku-1", quantityMilliPerKit: 2000 },
    { productId: "sku-2", quantityMilliPerKit: 2000 },
  ]);
  const old = recipe.version;
  const revised = kitRecipes.updateCommerceKitRecipe(recipe.id, old, {
    name: "Updated CCTV kit",
    components: parseCommerceKitRecipeRows([row("3"), row("1", "sku-2")]),
  });
  assert.equal(revised.version, old + 1);
  assert.throws(() => kitRecipes.deleteCommerceKitRecipe(recipe.id, old), /changed/);
  assert.equal(JSON.stringify(products.exportCoreState()), before, "composing drafts cannot mutate stock or selling price");
});

test("Products toolbar and manager use the authoritative local kit domain APIs only", () => {
  const page = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/products/page.tsx", import.meta.url), "utf8");
  const ui = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/products/kit-recipe-manager.tsx", import.meta.url), "utf8");
  assert.match(page, /<KitRecipeManager\s*\/>/);
  assert.match(ui, /Manage kit recipe drafts/);
  assert.match(ui, /parseCommerceKitRecipeRows\(/);
  assert.match(ui, /createCommerceKitRecipe\(/);
  assert.match(ui, /updateCommerceKitRecipe\(editing\.id, editing\.version/);
  assert.match(ui, /deleteCommerceKitRecipe\(id, version\)/);
  assert.match(ui, /previewCommerceKitRecipe\(id, Number\(kitCount\.trim\(\)\)\)/);
  assert.match(ui, /can\("products\.manage"\)/);
  assert.match(ui, /Device-local drafts only/);
  assert.match(ui, /Stock availability is not checked/);
});

test("product removal is rechecked by the domain rather than trusted from select options", () => {
  setup();
  const recipe = kitRecipes.createCommerceKitRecipe({
    name: "Demo", components: parseCommerceKitRecipeRows([row("2")]),
  });
  products.hydrateCore({ customers: [], categories: [], sales: [], payments: [],
    products: [{ id: "sku-1", name: "Inactive", sellingPrice: 5, unit: "pcs", isActive: false, deletedAt: null, branchId: null, hasVariants: false }],
  });
  assert.throws(() => kitRecipes.previewCommerceKitRecipe(recipe.id, 1), /unavailable/);
  assert.throws(() => kitRecipes.updateCommerceKitRecipe(recipe.id, 1, {
    name: "Edited", components: parseCommerceKitRecipeRows([row("2")]),
  }), /active company-wide saleable/);
});
