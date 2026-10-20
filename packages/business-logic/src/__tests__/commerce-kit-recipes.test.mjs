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
const kits = require("../commerce-kit-recipes.ts");
const store = require("../store.ts");
const permissions = require("../permissions.ts");
const persistence = require("../persistence.ts");
const shop = require("../shop-profile.ts");

const product = (id, price, patch = {}) => ({
  id, name: "Product " + id, sku: id, unit: "pcs",
  costPrice: 2, sellingPrice: price, stockQuantity: 90, minimumStock: 0,
  categoryId: null, isActive: true, deletedAt: null, branchId: null,
  hasVariants: false, createdAt: "2026-01-01", updatedAt: "2026-01-01",
  version: 1, ...patch,
});
const components = () => [
  { productId: "sku-a", quantityMilliPerKit: 1000 },
  { productId: "sku-b", quantityMilliPerKit: 2000 },
];
function reset(products = [product("sku-a", 10.25), product("sku-b", 2.5)]) {
  permissions.setCurrentRole("admin");
  permissions.setRuntimeFeaturePolicy(null);
  shop.hydrateShopProfile({ ...shop.getShopProfile(), shopName: "Kit Shop", currency: "INR" });
  store.hydrateCore({ customers: [], products, categories: [], sales: [], payments: [] });
  kits.hydrateCommerceKitRecipes([]);
}
function make(input = {}) {
  return kits.createCommerceKitRecipe({ name: "Service Starter Kit", components: components(), ...input });
}

test("create aggregates duplicate SKUs, clones records and never changes sale master", () => {
  reset();
  const before = JSON.stringify(store.exportCoreState());
  const recipe = make({ components: [
    { productId: "sku-b", quantityMilliPerKit: 1500 },
    { productId: "sku-a", quantityMilliPerKit: 1000 },
    { productId: "sku-b", quantityMilliPerKit: 500 },
  ] });
  assert.equal(recipe.version, 1);
  assert.equal(recipe.draftOnly, true);
  assert.deepEqual(recipe.components, components());
  recipe.components[0].quantityMilliPerKit = 1;
  assert.equal(kits.listCommerceKitRecipes()[0].components[0].quantityMilliPerKit, 1000);
  assert.equal(JSON.stringify(store.exportCoreState()), before);
});

test("live catalog price preview is nonbinding and reflects later price updates", () => {
  reset();
  const recipe = make();
  const before = JSON.stringify(store.exportCoreState());
  const original = kits.previewCommerceKitRecipe(recipe.id, 2);
  assert.equal(original.kind, "nonbinding_bundle_price_preview");
  assert.equal(original.total, "30.50");
  assert.equal(original.kitTotal, "15.25");
  assert.equal(JSON.stringify(store.exportCoreState()), before);

  store.hydrateCore({ customers: [], categories: [], sales: [], payments: [],
    products: [product("sku-a", 12), product("sku-b", 2.5)] });
  const adjusted = kits.previewCommerceKitRecipe(recipe.id, 2);
  assert.equal(adjusted.total, "34.00");
  assert.equal(kits.listCommerceKitRecipes()[0].components.length, 2);
});

test("optimistic edit preserves ID and creation time; stale/duplicate revisions fail closed", () => {
  reset();
  const recipe = make();
  const edited = kits.updateCommerceKitRecipe(recipe.id, 1, {
    name: "Changed kit",
    components: [{ productId: "sku-a", quantityMilliPerKit: 2000 }],
  });
  assert.equal(edited.version, 2);
  assert.equal(edited.createdAt, recipe.createdAt);
  assert.equal(edited.id, recipe.id);
  const before = JSON.stringify(kits.exportCommerceKitRecipes());
  assert.throws(() => kits.updateCommerceKitRecipe(recipe.id, 1, {
    name: "Stale", components: components(),
  }), /changed; reload/);
  assert.throws(() => kits.deleteCommerceKitRecipe(recipe.id, 1), /changed/);
  assert.equal(JSON.stringify(kits.exportCommerceKitRecipes()), before);
  const noop = kits.updateCommerceKitRecipe(recipe.id, 2, {
    name: edited.name, components: edited.components,
  });
  assert.equal(noop.version, 2);
  assert.equal(kits.deleteCommerceKitRecipe(recipe.id, 2), true);
  assert.deepEqual(kits.listCommerceKitRecipes(), []);
});

test("staff cannot mutate kit drafts, and foreign/inactive/product-parent SKUs are refused", () => {
  reset();
  permissions.setCurrentRole("staff");
  assert.throws(() => make(), /Permission denied/);
  permissions.setCurrentRole("admin");
  for (const patch of [
    { branchId: "foreign" }, { isActive: false },
    { deletedAt: "2026-10-01" }, { hasVariants: true },
  ]) {
    reset([product("sku-a", 10.25, patch), product("sku-b", 2.5)]);
    assert.throws(() => make(), /company-wide saleable SKU/);
    assert.equal(kits.listCommerceKitRecipes().length, 0);
  }
});

test("invalid quantities, extra authority keys and overflows leave store unchanged", () => {
  reset();
  const before = JSON.stringify(kits.exportCommerceKitRecipes());
  for (const q of [0, -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => make({ components: [{ productId: "sku-a", quantityMilliPerKit: q }] }));
  }
  assert.throws(() => make({ components: [
    { productId: "sku-a", quantityMilliPerKit: Number.MAX_SAFE_INTEGER },
    { productId: "sku-a", quantityMilliPerKit: 1 },
  ] }), /overflow/);
  assert.throws(() => make({ currency: "USD" }), /accepts only/);
  assert.throws(() => make({ components: [{ productId: "sku-a", quantityMilliPerKit: 1000, branchId: "foreign" }] }), /Invalid kit component/);
  assert.throws(() => make({ name: " " }));
  assert.equal(JSON.stringify(kits.exportCommerceKitRecipes()), before);
});

test("untrusted backup cannot inject price, tenant scope, duplicate SKU or revision", () => {
  reset();
  const valid = make();
  const before = JSON.stringify(kits.exportCommerceKitRecipes());
  for (const dirty of [
    { ...valid, approved: true },
    { ...valid, sellingPrice: 0.01 },
    { ...valid, customerGroupId: "group1" },
    { ...valid, version: 0 },
    { ...valid, draftOnly: false },
    { ...valid, components: [...valid.components, valid.components[0]] },
    { ...valid, components: [{ productId: "sku-a", quantityMilliPerKit: 1000, branchId: "other" }] },
  ]) {
    assert.throws(() => kits.hydrateCommerceKitRecipes([dirty]));
    assert.equal(JSON.stringify(kits.exportCommerceKitRecipes()), before);
  }
  assert.throws(() => kits.hydrateCommerceKitRecipes([valid, valid]), /Duplicate/);
  assert.equal(JSON.stringify(kits.exportCommerceKitRecipes()), before);
});

test("full snapshot roundtrip restores kit drafts; legacy snapshot clears prior draft data", () => {
  reset();
  const created = make();
  const saved = persistence.exportDomainSnapshotFull();
  assert.equal(saved.commerceKitRecipes.length, 1);
  assert.equal(persistence.validateDomainSnapshot(saved).ok, true);
  const dirty = structuredClone(saved);
  dirty.commerceKitRecipes[0].isPublished = true;
  assert.equal(persistence.validateDomainSnapshot(dirty).ok, false);
  assert.equal(kits.listCommerceKitRecipes()[0].id, created.id);
  kits.hydrateCommerceKitRecipes([]);
  const restored = persistence.importDomainSnapshot(saved);
  assert.equal(restored.ok, true, restored.error);
  assert.equal(kits.listCommerceKitRecipes()[0].id, created.id);
  const old = structuredClone(saved);
  delete old.commerceKitRecipes;
  const done = persistence.importDomainSnapshot(old);
  assert.equal(done.ok, true, done.error);
  assert.deepEqual(kits.listCommerceKitRecipes(), []);
});

test("kit quote rejects retired SKU at preview time even if recipe was saved earlier", () => {
  reset();
  const recipe = make();
  store.hydrateCore({
    customers: [], categories: [], sales: [], payments: [],
    products: [product("sku-a", 10.25, { isActive: false }), product("sku-b", 2.5)],
  });
  assert.throws(() => kits.previewCommerceKitRecipe(recipe.id, 1), /unavailable/);
  assert.throws(() => kits.previewCommerceKitRecipe(recipe.id, 0), /unavailable|Kit count/);
});
