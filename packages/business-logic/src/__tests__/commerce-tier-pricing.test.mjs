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
  }).outputText, filename
);
const { quoteCommerceTierPrice } = require("../commerce-tier-pricing.ts");

const tier = (patch = {}) => ({
  id: "tier-one", productId: "sku-1", minQuantity: 2, unitPrice: 9.99, ...patch,
});
const quote = (patch = {}) => quoteCommerceTierPrice({
  productId: "sku-1", currency: "INR", quantity: 2.5, baseUnitPrice: 12,
  tiers: [], ...patch,
});

test("no active tier returns a nonbinding, exact-cent regular quote", () => {
  assert.deepEqual(quote(), {
    kind: "nonbinding_tier_price_preview", productId: "sku-1", currency: "INR",
    quantity: 2.5, baseUnitPrice: "12.00", unitPrice: "12.00",
    lineTotal: "30.00", appliedTierId: null,
  });
});

test("quantity tiers choose the largest eligible threshold and round line cents once", () => {
  const rules = [
    tier({ id: "larger", minQuantity: 5, unitPrice: 8.99 }),
    tier({ id: "smaller", minQuantity: 2, unitPrice: 9.99 }),
    tier({ id: "minimum", minQuantity: 1, unitPrice: 11.5 }),
  ];
  const saved = JSON.stringify(rules);
  const result = quote({ tiers: rules });
  assert.equal(result.unitPrice, "9.99");
  assert.equal(result.lineTotal, "24.98", "9.99 x 2.5 rounds to 24.98");
  assert.equal(result.appliedTierId, "smaller");
  assert.equal(JSON.stringify(rules), saved, "rules remain unmodified");
});

test("verified group and branch contexts select scoped prices with deterministic precedence", () => {
  const rules = [
    tier({ id: "public", minQuantity: 2, unitPrice: 9 }),
    tier({ id: "branch", minQuantity: 2, unitPrice: 8.5, branchId: "b1" }),
    tier({ id: "group", minQuantity: 2, unitPrice: 8, customerGroupId: "wholesale" }),
    tier({ id: "group-and-branch", minQuantity: 2, unitPrice: 7,
      customerGroupId: "wholesale", branchId: "b1" }),
  ];
  assert.equal(quote({ tiers: rules }).appliedTierId, "public");
  assert.equal(quote({ tiers: rules, branchId: "b1" }).appliedTierId, "branch");
  assert.equal(quote({ tiers: rules, customerGroupId: "wholesale" }).appliedTierId, "group");
  assert.equal(quote({ tiers: rules, branchId: "b1", customerGroupId: "wholesale" }).appliedTierId, "group-and-branch");
  assert.equal(quote({ tiers: rules, branchId: "b2", customerGroupId: "wholesale" }).appliedTierId, "group");
  assert.equal(quote({ tiers: rules, branchId: "b2", customerGroupId: "retail" }).appliedTierId, "public");
});

test("unrelated product rules never affect the requested SKU", () => {
  const q = quote({ tiers: [tier({ id: "different-sku", productId: "sku-other", unitPrice: 1 })] });
  assert.equal(q.appliedTierId, null);
  assert.equal(q.unitPrice, "12.00");
});

test("invalid prices, quantities and untrusted scopes fail closed", () => {
  for (const baseUnitPrice of [NaN, Infinity, -1, 1.005, 9007199254740991]) {
    assert.throws(() => quote({ baseUnitPrice }), /Base unit price/);
  }
  for (const quantity of [0, -1, NaN, Infinity, 1.0004]) {
    assert.throws(() => quote({ quantity }), /quantity/i);
  }
  for (const invalid of [
    tier({ unitPrice: 1.001 }),
    tier({ unitPrice: 12.01 }),
    tier({ minQuantity: 1.0005 }),
    tier({ branchId: " " }),
    tier({ customerGroupId: "group " }),
  ]) {
    assert.throws(() => quote({ tiers: [invalid] }), /Tier|scope/);
  }
  assert.throws(() => quote({ currency: "₹" }), /currency/i);
  assert.throws(() => quote({ branchId: " " }), /Branch scope/);
  assert.throws(() => quote({ customerGroupId: " " }), /Customer group scope/);
  assert.throws(() => quote({ tiers: null }), /array/);
});

test("ambiguous same-scope thresholds and duplicate rule IDs cannot set prices", () => {
  assert.throws(() => quote({ tiers: [tier({ id: "one" }), tier({ id: "two", unitPrice: 8 })] }), /Conflicting/);
  assert.throws(() => quote({ tiers: [tier(), tier({ minQuantity: 3 })] }), /Duplicate tier identity/);
});
