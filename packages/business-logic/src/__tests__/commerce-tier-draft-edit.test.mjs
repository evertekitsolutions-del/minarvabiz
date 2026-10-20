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

const drafts = require("../commerce-tier-drafts.ts");
const quote = require("../commerce-tier-quote-draft.ts");
const store = require("../store.ts");
const shop = require("../shop-profile.ts");
const permissions = require("../permissions.ts");
const snapshots = require("../persistence.ts");

function sourceProduct(patch = {}) {
  return {
    id: "p-update", name: "Editable kit", sku: "EDIT-KIT",
    costPrice: 30, sellingPrice: 100, stockQuantity: 15,
    minimumStock: 0, unit: "pcs", isActive: true, deletedAt: null,
    categoryId: null, branchId: null, createdAt: "2026-01-01",
    updatedAt: "2026-01-01", version: 1, ...patch,
  };
}
function reset(product = sourceProduct()) {
  permissions.setCurrentRole("admin");
  permissions.setRuntimeFeaturePolicy(null);
  shop.hydrateShopProfile({ ...shop.getShopProfile(), shopName: "Pricing test store", currency: "INR" });
  store.hydrateCore({ products: [product], customers: [], categories: [], sales: [], payments: [] });
  drafts.hydrateCommerceTierDrafts([]);
}
function make(minQuantity = 5, unitPrice = 90) {
  return drafts.createCommerceTierDraft({ productId: "p-update", minQuantity, unitPrice });
}

test("editing an offline draft increments version and preserves createdAt and identity", () => {
  reset();
  const created = make();
  const beforeCore = JSON.stringify(store.exportCoreState());
  const updated = drafts.updateCommerceTierDraft(created.id, created.version, {
    minQuantity: 8, unitPrice: 80.25,
  });
  assert.equal(updated.id, created.id);
  assert.equal(updated.productId, created.productId);
  assert.equal(updated.currency, "INR");
  assert.equal(updated.draftOnly, true);
  assert.equal(updated.version, 2);
  assert.equal(updated.createdAt, created.createdAt);
  assert.equal(updated.minQuantity, 8);
  assert.equal(updated.unitPrice, 80.25);
  assert.equal(drafts.listCommerceTierDrafts("p-update")[0].version, 2);
  assert.equal(JSON.stringify(store.exportCoreState()), beforeCore, "retail stock and ledger data cannot be changed by draft edit");
  const result = quote.parseCommerceQuoteDraft({
    productId: "p-update", currency: "INR", baseUnitPrice: 100,
    quantity: "8", tierMinQuantity: "", tierUnitPrice: "",
  }, drafts.listCommerceTierDrafts("p-update"));
  assert.equal(result.unitPrice, "80.25");
  assert.equal(result.lineTotal, "642.00");
  const backedUp = snapshots.exportDomainSnapshotFull();
  assert.equal(backedUp.commerceTierDrafts[0].version, 2);
  drafts.hydrateCommerceTierDrafts([]);
  assert.equal(snapshots.importDomainSnapshot(backedUp).ok, true);
  assert.equal(drafts.listCommerceTierDrafts()[0].unitPrice, 80.25);
});

test("stale revision and duplicate SKU thresholds reject without changing drafts", () => {
  reset();
  const first = make(5, 90);
  make(10, 85);
  const updated = drafts.updateCommerceTierDraft(first.id, 1, { minQuantity: 6, unitPrice: 88 });
  const before = JSON.stringify(drafts.exportCommerceTierDrafts());
  assert.throws(() => drafts.updateCommerceTierDraft(first.id, 1, { minQuantity: 7, unitPrice: 78 }), /changed; reload/);
  assert.throws(() => drafts.updateCommerceTierDraft(updated.id, 2, { minQuantity: 10, unitPrice: 80 }), /already uses/);
  assert.throws(() => drafts.deleteCommerceTierDraft(updated.id, 1), /changed/);
  assert.equal(JSON.stringify(drafts.exportCommerceTierDrafts()), before);
});

test("update is fail-closed on invalid money, quantity, price increases and extra authority fields", () => {
  reset();
  const first = make();
  const before = JSON.stringify(drafts.exportCommerceTierDrafts());
  for (const patch of [
    { minQuantity: 5.0004, unitPrice: 85 },
    { minQuantity: 0, unitPrice: 85 },
    { minQuantity: 6, unitPrice: 1.005 },
    { minQuantity: 6, unitPrice: 101 },
    { minQuantity: 6, unitPrice: Infinity },
    { minQuantity: 6, unitPrice: 80, customerGroupId: "unverified" },
    { minQuantity: 6, unitPrice: 80, branchId: "foreign" },
  ]) {
    assert.throws(() => drafts.updateCommerceTierDraft(first.id, 1, patch));
    assert.equal(JSON.stringify(drafts.exportCommerceTierDrafts()), before);
  }
  assert.throws(() => drafts.updateCommerceTierDraft("missing", 1, { minQuantity: 6, unitPrice: 80 }), /no longer exists/);
});

test("permissions, changed retail price, inactive SKU and shop currency prevent stale edits", () => {
  reset();
  const item = make();
  permissions.setCurrentRole("staff");
  assert.throws(() => drafts.updateCommerceTierDraft(item.id, 1, { minQuantity: 6, unitPrice: 80 }), /Permission denied/);
  permissions.setCurrentRole("admin");
  let before = JSON.stringify(drafts.exportCommerceTierDrafts());

  store.hydrateCore({ products: [sourceProduct({ sellingPrice: 70 })], customers: [], categories: [], sales: [], payments: [] });
  assert.throws(() => drafts.updateCommerceTierDraft(item.id, 1, { minQuantity: 6, unitPrice: 80 }), /cannot exceed/);
  assert.equal(JSON.stringify(drafts.exportCommerceTierDrafts()), before);

  store.hydrateCore({ products: [sourceProduct({ isActive: false })], customers: [], categories: [], sales: [], payments: [] });
  assert.throws(() => drafts.updateCommerceTierDraft(item.id, 1, { minQuantity: 6, unitPrice: 60 }), /active company-wide/);
  assert.equal(JSON.stringify(drafts.exportCommerceTierDrafts()), before);

  store.hydrateCore({ products: [sourceProduct()], customers: [], categories: [], sales: [], payments: [] });
  shop.hydrateShopProfile({ ...shop.getShopProfile(), currency: "USD" });
  assert.throws(() => drafts.updateCommerceTierDraft(item.id, 1, { minQuantity: 6, unitPrice: 60 }), /currency differs/);
  assert.equal(JSON.stringify(drafts.exportCommerceTierDrafts()), before);
});

test("no-op edit leaves version stable, overflowed versions never wrap", () => {
  reset();
  const first = make();
  const result = drafts.updateCommerceTierDraft(first.id, 1, { minQuantity: 5, unitPrice: 90 });
  assert.equal(result.version, 1);
  const max = { ...first, version: Number.MAX_SAFE_INTEGER };
  drafts.hydrateCommerceTierDrafts([max]);
  const before = JSON.stringify(drafts.exportCommerceTierDrafts());
  assert.throws(() => drafts.updateCommerceTierDraft(first.id, Number.MAX_SAFE_INTEGER, {
    minQuantity: 6, unitPrice: 80,
  }), /revision exhausted/);
  assert.equal(JSON.stringify(drafts.exportCommerceTierDrafts()), before);
});

test("Products UI provides edit/cancel and uses versioned domain updates only", () => {
  const ui = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/products/page.tsx", import.meta.url), "utf8");
  assert.match(ui, /Edit draft/);
  assert.match(ui, /Save draft changes/);
  assert.match(ui, /Cancel edit/);
  assert.match(ui, /startB2BTierDraftEdit\(/);
  assert.match(ui, /updateCommerceTierDraft\(quoteEditingDraft\.id, quoteEditingDraft\.version, candidate\)/);
  assert.match(ui, /quoteEditingDraft\?\.id/);
  assert.match(ui, /Saved in this device backup only/);
});
