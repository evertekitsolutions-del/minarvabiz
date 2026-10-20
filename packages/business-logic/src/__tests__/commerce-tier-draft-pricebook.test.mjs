import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) =>
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);

const tiers = require("../commerce-tier-drafts.ts");
const quote = require("../commerce-tier-quote-draft.ts");
const store = require("../store.ts");
const permissions = require("../permissions.ts");
const snapshot = require("../persistence.ts");
const shop = require("../shop-profile.ts");

function product(patch = {}) {
  return {
    id: "tier-sku", name: "Commercial Kit", sku: "KIT-1",
    costPrice: 20, sellingPrice: 100, stockQuantity: 20, minimumStock: 0,
    categoryId: null, unit: "pcs", branchId: null, isActive: true, deletedAt: null,
    createdAt: "2026-01-01", updatedAt: "2026-01-01", version: 1,
    ...patch,
  };
}
function reset() {
  permissions.setCurrentRole("admin");
  permissions.setRuntimeFeaturePolicy(null);
  shop.hydrateShopProfile({ ...shop.getShopProfile(), shopName: "Tier Store", currency: "INR" });
  store.hydrateCore({ customers: [], products: [product()], categories: [], sales: [], payments: [] });
  tiers.hydrateCommerceTierDrafts([]);
}
function make(patch = {}) {
  return tiers.createCommerceTierDraft({
    productId: "tier-sku", minQuantity: 5, unitPrice: 90.5, ...patch,
  });
}

test("seller saves a local price-tier draft and its list is cloned, not mutable authority", () => {
  reset();
  const created = make();
  assert.equal(created.productId, "tier-sku");
  assert.equal(created.draftOnly, true);
  assert.equal(created.version, 1);
  assert.equal(created.currency, "INR");
  assert.equal(created.unitPrice, 90.5);
  const cloned = tiers.listCommerceTierDrafts("tier-sku");
  assert.equal(cloned.length, 1);
  cloned[0].unitPrice = 1;
  assert.equal(tiers.listCommerceTierDrafts()[0].unitPrice, 90.5);
  assert.equal(tiers.exportCommerceTierDrafts()[0].unitPrice, 90.5);
});

test("draft-only rules change quote previews but never retail price, balances or sale master", () => {
  reset();
  make({ minQuantity: 2, unitPrice: 75 });
  const before = JSON.stringify(store.exportCoreState());
  const price = quote.parseCommerceQuoteDraft({
    productId: "tier-sku", baseUnitPrice: 100, currency: "INR",
    quantity: "2", tierMinQuantity: "", tierUnitPrice: "",
  }, tiers.listCommerceTierDrafts("tier-sku"));
  assert.equal(price.kind, "nonbinding_tier_price_preview");
  assert.equal(price.unitPrice, "75.00");
  assert.equal(price.lineTotal, "150.00");
  assert.ok(price.appliedTierId);
  assert.equal(JSON.stringify(store.exportCoreState()), before);
  assert.equal(store.getProduct("tier-sku").sellingPrice, 100);
});

test("duplicate thresholds, precise money and invalid SKU scope fail closed", () => {
  reset();
  make();
  const before = JSON.stringify(tiers.exportCommerceTierDrafts());
  for (const patch of [
    { minQuantity: 5, unitPrice: 70 },
    { minQuantity: 1.0004, unitPrice: 70 },
    { minQuantity: 0, unitPrice: 70 },
    { unitPrice: 1.005 },
    { unitPrice: 101 },
    { productId: "not-a-product" },
  ]) assert.throws(() => make(patch));
  assert.equal(JSON.stringify(tiers.exportCommerceTierDrafts()), before);
  store.hydrateCore({ customers: [], products: [product({ branchId: "foreign-branch" })],
    categories: [], sales: [], payments: [] });
  assert.throws(() => make({ minQuantity: 8 }), /company-wide products/);
  assert.equal(JSON.stringify(tiers.exportCommerceTierDrafts()), before);
});

test("permission and optimistic revision gate local draft deletion", () => {
  reset();
  const created = make();
  permissions.setCurrentRole("staff");
  assert.throws(() => make({ minQuantity: 8 }), /Permission denied/);
  assert.throws(() => tiers.deleteCommerceTierDraft(created.id, created.version), /Permission denied/);
  permissions.setCurrentRole("admin");
  assert.throws(() => tiers.deleteCommerceTierDraft(created.id, 2), /changed/);
  assert.equal(tiers.listCommerceTierDrafts().length, 1);
  assert.equal(tiers.deleteCommerceTierDraft(created.id, created.version), true);
  assert.equal(tiers.deleteCommerceTierDraft(created.id, created.version), false);
  assert.deepEqual(tiers.exportCommerceTierDrafts(), []);
});

test("untrusted backup cannot inject customer or branch authority into local tiers", () => {
  reset();
  const valid = make();
  const before = JSON.stringify(tiers.exportCommerceTierDrafts());
  for (const bad of [
    { ...valid, branchId: "other-branch" },
    { ...valid, customerGroupId: "wholesale" },
    { ...valid, unitPrice: 10.001 },
    { ...valid, minQuantity: 1.0004 },
    { ...valid, draftOnly: false },
    { ...valid, currency: "inr" },
    { ...valid, version: 0 },
  ]) {
    assert.throws(() => tiers.hydrateCommerceTierDrafts([bad]));
    assert.equal(JSON.stringify(tiers.exportCommerceTierDrafts()), before);
  }
  assert.throws(() => tiers.hydrateCommerceTierDrafts([valid, valid]), /Duplicate/);
  assert.equal(JSON.stringify(tiers.exportCommerceTierDrafts()), before);
});

test("local draft pricebook participates in complete backup validation and restore", () => {
  reset();
  make();
  const saved = snapshot.exportDomainSnapshotFull();
  assert.equal(saved.commerceTierDrafts.length, 1);
  assert.equal(snapshot.validateDomainSnapshot(saved).ok, true);
  const invalid = structuredClone(saved);
  invalid.commerceTierDrafts[0].customerGroupId = "unverified";
  assert.equal(snapshot.validateDomainSnapshot(invalid).ok, false);
  assert.equal(tiers.listCommerceTierDrafts().length, 1, "failed validation must not mutate live drafts");
  tiers.hydrateCommerceTierDrafts([]);
  const restored = snapshot.importDomainSnapshot(saved);
  assert.equal(restored.ok, true, restored.error);
  assert.equal(tiers.listCommerceTierDrafts("tier-sku").length, 1);
  const old = structuredClone(saved);
  delete old.commerceTierDrafts;
  const replaced = snapshot.importDomainSnapshot(old);
  assert.equal(replaced.ok, true, replaced.error);
  assert.equal(tiers.listCommerceTierDrafts().length, 0, "legacy backup must clear foreign local drafts");
});

test("Products UI labels local drafts and never posts them as checkout authority", () => {
  const page = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/products/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Save local tier draft/);
  assert.match(page, /Saved local tiers \(draft only\)/);
  assert.match(page, /createCommerceTierDraft\(/);
  assert.match(page, /deleteCommerceTierDraft\(/);
  assert.match(page, /listCommerceTierDrafts\(/);
  assert.match(page, /Saved in this device backup only/);
  assert.match(page, /can\("products\.manage"\)/);
});
