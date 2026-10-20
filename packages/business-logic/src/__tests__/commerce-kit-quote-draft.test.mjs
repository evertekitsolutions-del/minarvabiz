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
const { parseCommerceKitQuoteDraft } = require("../commerce-kit-quote-draft.ts");

const product = (id, price = 9.99, patch = {}) => ({
  id, name: "Kit piece " + id, unit: "pcs", sellingPrice: price,
  isActive: true, deletedAt: null, branchId: null, hasVariants: false, ...patch,
});
const draft = (patch = {}) => ({
  kitCount: "2", currency: "INR",
  components: [
    { productId: "kit-a", quantityPerKit: "0.5" },
    { productId: "kit-b", quantityPerKit: "2" },
  ],
  products: [product("kit-a", 9.99), product("kit-b", 3)],
  ...patch,
});

test("kit quote parser accepts exact positive decimal quantities and returns nonbinding total", () => {
  const input = draft();
  const unchanged = JSON.stringify(input);
  const result = parseCommerceKitQuoteDraft(input);
  assert.equal(result.kind, "nonbinding_bundle_price_preview");
  assert.equal(result.total, "21.99");
  assert.equal(result.kitTotal, "");
  assert.deepEqual(result.lines.map(l => [l.productId, l.quantity, l.lineTotal]),
    [["kit-a", 1, "9.99"], ["kit-b", 4, "12.00"]]);
  assert.equal(JSON.stringify(input), unchanged);
});

test("kit seller draft groups duplicate products before rounding", () => {
  const q = parseCommerceKitQuoteDraft(draft({
    kitCount: "1", products: [product("kit-a", 9.99)],
    components: [
      { productId: "kit-a", quantityPerKit: " 0.500 " },
      { productId: "kit-a", quantityPerKit: "0.5" },
    ],
  }));
  assert.equal(q.lines.length, 1);
  assert.equal(q.lines[0].quantity, 1);
  assert.equal(q.total, "9.99");
});

test("invalid kit-count text cannot be silently coerced to a numeric quantity", () => {
  for (const kitCount of ["", "0", "-1", "1.2", "1e3", "Infinity", "NaN", "9007199254740999"]) {
    assert.throws(() => parseCommerceKitQuoteDraft(draft({ kitCount })), /Kit count/);
  }
  assert.throws(() => parseCommerceKitQuoteDraft(draft({ components: null })), /array/);
});

test("invalid component decimal text and out-of-range units reject before quote", () => {
  for (const quantity of ["", "0", "-1", "1e3", "1.0004", "NaN", "Infinity", "999999999999999999"]) {
    assert.throws(() => parseCommerceKitQuoteDraft(draft({
      components: [{ productId: "kit-a", quantityPerKit: quantity }],
    })), /Kit component 1 quantity/);
  }
});

test("non-saleable products and invalid catalog unit prices fail closed", () => {
  for (const productPatch of [
    { branchId: "another-shop" },
    { isActive: false },
    { deletedAt: "2026-01-01" },
    { hasVariants: true },
    { sellingPrice: 9.999 },
  ]) {
    assert.throws(() => parseCommerceKitQuoteDraft(draft({
      components: [{ productId: "kit-a", quantityPerKit: "1" }],
      products: [product("kit-a", 9.99, productPatch)],
    })), /catalog|price/i);
  }
});

test("seller Products page exposes a genuine read-only kit pricing workflow", () => {
  const page = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/products/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Kit price preview/);
  assert.match(page, /parseCommerceKitQuoteDraft\(/);
  assert.match(page, /kitCount: kitCountText/);
  assert.match(page, /products: store\.listProducts\(\)/);
  assert.match(page, /quantityPerKit/);
  assert.match(page, /Add kit component/);
  assert.match(page, /Calculate kit price/);
  assert.match(page, /No stock availability check/);
  assert.match(page, /Exact per-kit cents are unavailable/);
});

test("optional deletedAt from real Product rows normalizes without exposing private fields", () => {
  const rawProduct = {
    ...product("kit-a", 12.5, { deletedAt: undefined }),
    costPrice: 9.25, supplierId: "vendor-internal", stockQuantity: 12345,
    notes: "internal-remarks",
  };
  const result = parseCommerceKitQuoteDraft(draft({
    kitCount: "1",
    components: [{ productId: "kit-a", quantityPerKit: "2" }],
    products: [rawProduct],
  }));
  assert.equal(result.total, "25.00");
  const publicResult = JSON.stringify(result);
  for (const internal of ["costPrice", "supplierId", "stockQuantity", "notes", "vendor-internal", "internal-remarks"]) {
    assert.equal(publicResult.includes(internal), false, internal + " leaked into preview");
  }
});

test("new kit component defaults to an unused SKU while retaining deliberate duplicate support", () => {
  const page = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/products/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const selected = new Set\(kitComponents\.map\(\(item\) => item\.productId\)\)/);
  assert.match(page, /available\.find\(\(product\) => !selected\.has\(product\.id\)\) \?\? available\[0\]/);
  assert.match(page, /quote engine correctly aggregates their quantities/);
});
