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

const { preflightCommerceKitRecipeStock } = require("../commerce-kit-recipe-stock.ts");
const recipes = require("../commerce-kit-recipes.ts");
const store = require("../store.ts");
const permissions = require("../permissions.ts");

const product = (id, options = {}) => ({
  id, name: "Product " + id, sku: id, unit: "pcs",
  costPrice: 4, sellingPrice: 10, stockQuantity: 50, minimumStock: 0,
  categoryId: null, isActive: true, deletedAt: null,
  branchId: null, hasVariants: false, ...options,
});
const lot = (id, productId, quantity, opts = {}) => ({
  id, batchCode: id, orgId: "org-1", warehouseId: "wh-1",
  productId, expiresOn: "2027-11-01",
  onHandMilli: quantity, reservedMilli: 0, status: "active", ...opts,
});
function setup() {
  permissions.setCurrentRole("admin");
  permissions.setRuntimeFeaturePolicy(null);
  store.hydrateCore({ customers: [], products: [product("sku-a"), product("sku-b")],
    categories: [], sales: [], payments: [] });
  recipes.hydrateCommerceKitRecipes([]);
  return recipes.createCommerceKitRecipe({
    name: "Two-part kit", components: [
      { productId: "sku-a", quantityMilliPerKit: 1500 },
      { productId: "sku-b", quantityMilliPerKit: 1000 },
    ],
  });
}
function request(recipe, options = {}) {
  return {
    recipeId: recipe.id, expectedRecipeVersion: recipe.version,
    orgId: "org-1", warehouseId: "wh-1", asOfDate: "2026-10-21",
    kitCount: 2,
    lots: [
      lot("a-late", "sku-a", 2500, { expiresOn: "2027-06-01" }),
      lot("a-first", "sku-a", 1000, { expiresOn: "2026-11-01" }),
      lot("b-available", "sku-b", 3000),
    ],
    ...options,
  };
}

test("two-SKU saved kit selects FEFO lots once and changes no stock or recipe", () => {
  const recipe = setup();
  const input = request(recipe);
  const before = JSON.stringify({ input, catalog: store.exportCoreState(), drafts: recipes.exportCommerceKitRecipes() });
  const result = preflightCommerceKitRecipeStock(input);
  assert.equal(result.kind, "nonbinding_kit_stock_preview");
  assert.equal(result.recipeVersion, 1);
  assert.equal(result.kitCount, 2);
  assert.deepEqual(result.requirements, [
    { productId: "sku-a", quantityMilli: 3000, allocations: [
      { batchId: "a-first", quantityMilli: 1000 },
      { batchId: "a-late", quantityMilli: 2000 },
    ] },
    { productId: "sku-b", quantityMilli: 2000, allocations: [
      { batchId: "b-available", quantityMilli: 2000 },
    ] },
  ]);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.requirements));
  assert.equal(JSON.stringify({ input, catalog: store.exportCoreState(), drafts: recipes.exportCommerceKitRecipes() }), before);
});

test("edited recipe cannot be quoted against its obsolete quantity or revision", () => {
  const recipe = setup();
  const oldRequest = request(recipe);
  const updated = recipes.updateCommerceKitRecipe(recipe.id, recipe.version, {
    name: "Larger kit", components: [
      { productId: "sku-a", quantityMilliPerKit: 2000 },
      { productId: "sku-b", quantityMilliPerKit: 1000 },
    ],
  });
  assert.equal(updated.version, recipe.version + 1);
  assert.throws(() => preflightCommerceKitRecipeStock(oldRequest), /changed; reload/);
  assert.throws(() => preflightCommerceKitRecipeStock(request(updated)), /Insufficient saleable lot stock/);
});

test("later-SKU shortage leaves all lots, recipes and inventory untouched", () => {
  const recipe = setup();
  const input = request(recipe, { lots: [lot("a", "sku-a", 5000), lot("b", "sku-b", 1999)] });
  const before = JSON.stringify({ input, catalog: store.exportCoreState(), recipes: recipes.exportCommerceKitRecipes() });
  assert.throws(() => preflightCommerceKitRecipeStock(input), /Insufficient saleable lot stock/);
  assert.equal(JSON.stringify({ input, catalog: store.exportCoreState(), recipes: recipes.exportCommerceKitRecipes() }), before);
});

test("untrusted cross-warehouse/cross-org or duplicate lot rows cannot be treated as stock", () => {
  const recipe = setup();
  for (const wrongLot of [
    lot("wrong-org", "sku-a", 2000, { orgId: "org-other" }),
    lot("wrong-warehouse", "sku-a", 2000, { warehouseId: "wh-other" }),
    lot("unknown-sku", "sku-c", 2000),
  ]) {
    assert.throws(() => preflightCommerceKitRecipeStock(request(recipe, {
      lots: [...request(recipe).lots, wrongLot],
    })), /scope mismatch/);
  }
  assert.throws(() => preflightCommerceKitRecipeStock(request(recipe, {
    lots: [lot("duplicate", "sku-a", 4000), lot("duplicate", "sku-b", 3000)],
  })), /Duplicate/);
});

test("archived, inactive, branch-only or variant parent components fail before FEFO", () => {
  const recipe = setup();
  const request0 = request(recipe);
  for (const patch of [
    { isActive: false }, { deletedAt: "2026-10-19" },
    { branchId: "foreign-branch" }, { hasVariants: true },
  ]) {
    store.hydrateCore({ customers: [], products: [product("sku-a", patch), product("sku-b")],
      categories: [], sales: [], payments: [] });
    assert.throws(() => preflightCommerceKitRecipeStock(request0), /non-saleable or branch-specific/);
  }
});

test("permission, missing draft, stale versions and invalid dates/count fail closed", () => {
  const recipe = setup();
  const input = request(recipe);
  permissions.setCurrentRole("staff");
  assert.throws(() => preflightCommerceKitRecipeStock(input), /Permission denied/);
  permissions.setCurrentRole("admin");
  assert.throws(() => preflightCommerceKitRecipeStock({ ...input, recipeId: "missing" }), /no longer exists/);
  assert.throws(() => preflightCommerceKitRecipeStock({ ...input, expectedRecipeVersion: 0 }), /expected revision/);
  assert.throws(() => preflightCommerceKitRecipeStock({ ...input, kitCount: 1.25 }), /positive whole/);
  assert.throws(() => preflightCommerceKitRecipeStock({ ...input, asOfDate: "2026-02-30" }), /Invalid sale date/);
});
