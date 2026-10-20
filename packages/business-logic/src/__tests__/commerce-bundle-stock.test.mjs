import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename,
);
const { preflightCommerceBundleStock } = require("../commerce-bundle-stock.ts");
const lot = (id, productId, onHandMilli, patch = {}) => ({
  id, orgId: "org-1", productId, warehouseId: "w-1",
  batchCode: id, expiresOn: "2027-05-01", onHandMilli, reservedMilli: 0,
  status: "active", ...patch,
});
const input = (patch = {}) => ({
  orgId: "org-1", warehouseId: "w-1", asOfDate: "2026-10-20",
  bundleCount: 2,
  components: [
    { productId: "sku-A", quantityMilliPerBundle: 1500 },
    { productId: "sku-B", quantityMilliPerBundle: 2000 },
  ],
  lots: [
    lot("a-later", "sku-A", 2500, { expiresOn: "2027-06-01" }),
    lot("a-first", "sku-A", 1000, { expiresOn: "2026-11-01" }),
    lot("b-first", "sku-B", 5000),
  ],
  ...patch,
});

test("multi-SKU bundle preflight uses FEFO lots and never changes source stock", () => {
  const data = input();
  const before = JSON.stringify(data);
  const plan = preflightCommerceBundleStock(data);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(plan, [
    {
      productId: "sku-A", quantityMilli: 3000, allocations: [
        { batchId: "a-first", quantityMilli: 1000 },
        { batchId: "a-later", quantityMilli: 2000 },
      ],
    },
    { productId: "sku-B", quantityMilli: 4000, allocations: [
      { batchId: "b-first", quantityMilli: 4000 },
    ] },
  ]);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan[0].allocations));
  assert.deepEqual(preflightCommerceBundleStock(data), plan);
});

test("duplicate component SKU demand is aggregated before FEFO selection", () => {
  const plan = preflightCommerceBundleStock(input({
    components: [
      { productId: "sku-A", quantityMilliPerBundle: 1000 },
      { productId: "sku-A", quantityMilliPerBundle: 500 },
      { productId: "sku-B", quantityMilliPerBundle: 2000 },
    ],
  }));
  assert.equal(plan.filter(p => p.productId === "sku-A").length, 1);
  assert.equal(plan[0].quantityMilli, 3000);
  assert.equal(plan[0].allocations.reduce((sum, p) => sum + p.quantityMilli, 0), 3000);
  assert.throws(() => preflightCommerceBundleStock(input({
    components: [
      { productId: "sku-A", quantityMilliPerBundle: 1000 },
      { productId: "sku-A", quantityMilliPerBundle: 1000 },
    ],
    lots: [lot("a-only", "sku-A", 3999)],
  })), /Insufficient saleable lot stock/);
});

test("shortage on a later SKU returns no partial output or mutation", () => {
  const data = input({ lots: [
    lot("a-available", "sku-A", 9000),
    lot("b-short", "sku-B", 3999),
  ] });
  const before = JSON.stringify(data);
  assert.throws(() => preflightCommerceBundleStock(data), /Insufficient saleable lot stock/);
  assert.equal(JSON.stringify(data), before);
});

test("expired, blocked and reserved lot units cannot cover bundle demand", () => {
  const data = input({
    components: [{ productId: "sku-A", quantityMilliPerBundle: 1000 }],
    lots: [
      lot("expired", "sku-A", 10000, { expiresOn: "2026-10-19" }),
      lot("blocked", "sku-A", 10000, { status: "blocked" }),
      lot("reserved", "sku-A", 2500, { reservedMilli: 1000 }),
    ],
  });
  assert.throws(() => preflightCommerceBundleStock(data), /Insufficient saleable lot stock/);
  assert.deepEqual(preflightCommerceBundleStock({
    ...data, bundleCount: 1,
  })[0].allocations, [{ batchId: "reserved", quantityMilli: 1000 }]);
});

test("branch, organization, unrelated product and duplicate lot IDs fail closed", () => {
  for (const wrong of [
    lot("wrong-org", "sku-A", 1000, { orgId: "org-2" }),
    lot("wrong-warehouse", "sku-A", 1000, { warehouseId: "w-2" }),
    lot("other-product", "sku-X", 1000),
  ]) {
    assert.throws(() => preflightCommerceBundleStock(input({ lots: [...input().lots, wrong] })), /scope mismatch/);
  }
  assert.throws(() => preflightCommerceBundleStock(input({
    lots: [lot("repeat-id", "sku-A", 4000), lot("repeat-id", "sku-B", 5000)],
  })), /Duplicate/);
});

test("unsafe quantities, invalid dates and corrupt stock reject without rounding", () => {
  for (const count of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => preflightCommerceBundleStock(input({ bundleCount: count })), /Bundle count/);
  }
  for (const milli of [0, -1, .5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => preflightCommerceBundleStock(input({
      components: [{ productId: "sku-A", quantityMilliPerBundle: milli }],
    })), /component/);
  }
  assert.throws(() => preflightCommerceBundleStock(input({ components: [] })), /contain components/);
  assert.throws(() => preflightCommerceBundleStock(input({
    components: [{ productId: "sku-A", quantityMilliPerBundle: Number.MAX_SAFE_INTEGER }],
  })), /safe integer range/);
  assert.throws(() => preflightCommerceBundleStock(input({ asOfDate: "2026-02-30" })), /Invalid sale date/);
  assert.throws(() => preflightCommerceBundleStock(input({
    lots: [lot("a-invalid", "sku-A", 2000, { reservedMilli: 3000 }), lot("b-ok", "sku-B", 9000)],
  })), /Invalid lot stock/);
});
