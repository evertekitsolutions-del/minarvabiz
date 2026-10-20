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
const { quoteCommerceBundle } = require("../commerce-bundle-quote.ts");
const product = (id, sellingPrice = 10, changes = {}) => ({
  id, name: "Product " + id, unit: "pcs", sellingPrice,
  isActive: true, deletedAt: null, branchId: null, hasVariants: false, ...changes,
});
const input = (patch = {}) => ({
  currency: "INR", kitCount: 2,
  components: [
    { productId: "sku-A", quantityMilliPerKit: 1000 },
    { productId: "sku-B", quantityMilliPerKit: 2000 },
  ],
  products: [product("sku-A", 10), product("sku-B", 1.25)],
  ...patch,
});

test("kit components are priced from allowlisted live selling prices without side effects", () => {
  const request = input();
  const before = JSON.stringify(request);
  const result = quoteCommerceBundle(request);
  assert.equal(result.kind, "nonbinding_bundle_price_preview");
  assert.equal(result.currency, "INR");
  assert.equal(result.kitCount, 2);
  assert.deepEqual(result.lines, [
    { productId: "sku-A", productName: "Product sku-A", unit: "pcs", quantity: 2, unitPrice: "10.00", lineTotal: "20.00" },
    { productId: "sku-B", productName: "Product sku-B", unit: "pcs", quantity: 4, unitPrice: "1.25", lineTotal: "5.00" },
  ]);
  assert.equal(result.total, "25.00");
  assert.equal(result.kitTotal, "12.50");
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.lines));
  assert.ok(Object.isFrozen(result.lines[0]));
  assert.equal(JSON.stringify(request), before);
});

test("duplicate SKU quantities aggregate before one line-cent rounding", () => {
  const quote = quoteCommerceBundle(input({
    kitCount: 1,
    components: [
      { productId: "sku-A", quantityMilliPerKit: 500 },
      { productId: "sku-A", quantityMilliPerKit: 500 },
    ],
    products: [product("sku-A", 9.99)],
  }));
  assert.equal(quote.lines.length, 1);
  assert.equal(quote.lines[0].quantity, 1);
  assert.equal(quote.lines[0].lineTotal, "9.99");
  assert.equal(quote.total, "9.99");
});

test("unequal per-kit cents are never presented as falsely exact prices", () => {
  const result = quoteCommerceBundle(input({
    kitCount: 2,
    components: [{ productId: "sku-A", quantityMilliPerKit: 500 }],
    products: [product("sku-A", 1.01)],
  }));
  assert.equal(result.total, "1.01");
  assert.equal(result.kitTotal, "", "do not claim a precise cent price per kit");
  assert.throws(() => quoteCommerceBundle(input({
    products: [product("sku-A", 1.005), product("sku-B", 1.25)],
  })), /Invalid selling price/);
});

test("missing, branch-only, archived or parent products cannot appear in a quote", () => {
  for (const invalid of [
    [], [product("sku-A")],
    [product("sku-A", 10, { isActive: false }), product("sku-B")],
    [product("sku-A", 10, { deletedAt: "2026-10-01" }), product("sku-B")],
    [product("sku-A", 10, { branchId: "foreign-branch" }), product("sku-B")],
    [product("sku-A", 10, { hasVariants: true }), product("sku-B")],
  ]) assert.throws(() => quoteCommerceBundle(input({ products: invalid })), /unavailable|catalog/i);
  assert.throws(() => quoteCommerceBundle(input({
    products: [product("sku-A"), product("sku-A"), product("sku-B")],
  })), /Duplicate bundle catalog product ID/);
});

test("invalid quantities, scope or currency reject without mutation", () => {
  for (const count of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => quoteCommerceBundle(input({ kitCount: count })), /Kit count/);
  }
  for (const quantity of [0, -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => quoteCommerceBundle(input({
      components: [{ productId: "sku-A", quantityMilliPerKit: quantity }],
    })), /component/);
  }
  assert.throws(() => quoteCommerceBundle(input({ currency: "inr" })), /currency/);
  assert.throws(() => quoteCommerceBundle(input({ components: [] })), /components/);
  assert.throws(() => quoteCommerceBundle(input({
    components: [{ productId: "sku-A", quantityMilliPerKit: Number.MAX_SAFE_INTEGER }],
  })), /safe numeric range/);
  assert.throws(() => quoteCommerceBundle(input({
    components: [{ productId: "sku-A", quantityMilliPerKit: 1000 }],
    products: [product("sku-A", Number.MAX_SAFE_INTEGER)],
  })), /Invalid selling price/);
});

test("price and quantity multiplication safely detect overflow", () => {
  assert.throws(() => quoteCommerceBundle(input({
    kitCount: 3,
    components: [{ productId: "sku-A", quantityMilliPerKit: 1000 }],
    products: [product("sku-A", 90071992547409)],
  })), /Money|range|Invalid/);
  assert.throws(() => quoteCommerceBundle(input({
    kitCount: 2,
    components: [{ productId: "sku-A", quantityMilliPerKit: 1000 }],
    products: [product("sku-A", 90071992547409.9)],
  })), /Money|range|Invalid/);
});
