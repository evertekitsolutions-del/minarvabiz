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
const { quoteInclusiveMrpUnitPrice } = require("../inclusive-mrp.ts");
const { calculateCartTotals } = require("../sales.ts");

test("SAL-015 MRP 118 inclusive of 18% tax uses existing exclusive-price checkout", () => {
  const quote = quoteInclusiveMrpUnitPrice(118, 18);
  assert.equal(quote.exclusiveUnitPrice, 100);
  assert.equal(quote.effectiveInclusiveUnitPrice, 118);
  assert.equal(quote.perUnitRoundingDifference, 0);
  const checked = calculateCartTotals([{
    productId: "product", productName: "Sample", quantity: 1,
    unitPrice: quote.exclusiveUnitPrice, taxRate: 18, discountPercent: 0,
  }]);
  assert.equal(checked.itemsTax, 18);
  assert.equal(checked.grandTotal, 118);
});

test("a nonrepresentable inclusive cent price NEVER exceeds entered MRP", () => {
  const quote = quoteInclusiveMrpUnitPrice(100, 18);
  assert.equal(quote.exclusiveUnitPrice, 84.74);
  assert.equal(quote.effectiveInclusiveUnitPrice, 99.99);
  assert.equal(quote.perUnitRoundingDifference, 0.01);
  for (const mrp of [0.02, 1, 1.01, 10, 42.99, 99.99, 99999.99]) {
    for (const rate of [0, 5, 12, 18, 28]) {
      const result = quoteInclusiveMrpUnitPrice(mrp, rate);
      assert.ok(result.effectiveInclusiveUnitPrice <= mrp, `MRP ${mrp}, tax ${rate}`);
      assert.ok(result.perUnitRoundingDifference >= 0);
      assert.equal(
        calculateCartTotals([{
          productId: "product", quantity: 1,
          unitPrice: result.exclusiveUnitPrice, discountPercent: 0,
          taxRate: rate,
        }]).grandTotal,
        result.effectiveInclusiveUnitPrice,
      );
    }
  }
});

test("discount is applied after MRP conversion through the standard financial engine", () => {
  const q = quoteInclusiveMrpUnitPrice(118, 18);
  const result = calculateCartTotals([{
    productId: "product", quantity: 2, unitPrice: q.exclusiveUnitPrice,
    discountPercent: 10, taxRate: 18,
  }]);
  assert.equal(result.itemsSubtotal, 200);
  assert.equal(result.itemsDiscount, 20);
  assert.equal(result.itemsTax, 32.40);
  assert.equal(result.grandTotal, 212.40);
});

test("invalid MRP, unsafe precision, invalid tax and zero-revenue traps fail closed", () => {
  const bad = [
    [NaN, 18], [Infinity, 18], [-1, 18],
    [10.001, 18], [10, NaN], [10, -5], [10, 101],
    [10, 12.345], [0.01, 100], [Number.MAX_SAFE_INTEGER, 18],
  ];
  for (const [mrp, rate] of bad) {
    assert.throws(() => quoteInclusiveMrpUnitPrice(mrp, rate), undefined,
      `Should refuse entered MRP ${mrp}, tax ${rate}`);
  }
  assert.equal(quoteInclusiveMrpUnitPrice(0, 0).exclusiveUnitPrice, 0);
});

test("both billing surfaces invoke manual MRP editor; no separate posting path", () => {
  const root = new URL("../../../../", import.meta.url);
  const read = (path) => fs.readFileSync(new URL(path, root), "utf8");
  const normal = read("packages/ui/src/components/sales/NormalBilling.tsx");
  const pos = read("packages/ui/src/components/sales/PosBilling.tsx");
  const editor = read("packages/ui/src/components/sales/InclusiveMrpEditor.tsx");
  assert.match(normal, /<InclusiveMrpEditor/);
  assert.match(pos, /<InclusiveMrpEditor/);
  assert.match(normal, /unitPrice: quote\.exclusiveUnitPrice/);
  assert.match(pos, /unitPrice: quote\.exclusiveUnitPrice/);
  assert.match(editor, /quoteInclusiveMrpUnitPrice\(Number\(input\), taxRate\)/);
  assert.doesNotMatch(editor, /createSale|remoteCreateSale|postFinancialInvoice/);
});
