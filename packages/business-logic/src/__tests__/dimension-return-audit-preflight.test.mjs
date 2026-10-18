import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      inlineSourceMap: true,
      inlineSources: true,
    },
  }).outputText, filename
);
const { quoteSaleReturn } = require("../return-value.ts");

const audit = Object.freeze({
  schema: "dimension-line-v1", algorithm: "area-v1",
  length: "12", width: "18", lengthUnit: "in", widthUnit: "in",
  billableUnit: "sqft", pieces: 2, quantityMilli: 3000,
});
function invoice(overrides = {}) {
  return {
    id: "sale-area", invoiceNumber: "INV-AREA",
    status: "completed", total: 300, paidAmount: 300, balanceAmount: 0,
    items: [{
      id: "line-area", productId: "product-area", productName: "Cut panel",
      quantity: 3, unitPrice: 100, costPrice: 50, discountPercent: 0,
      taxRate: 0, lineTotal: 300, dimensionMetadata: audit,
      ...overrides,
    }],
  };
}
const selection = (quantity) => [{
  saleItemId: "line-area", productId: "product-area",
  quantity, restock: false,
}];

test("dimensional invoice supports fractional area returns with exact recorded refund", () => {
  const sale = invoice();
  const first = quoteSaleReturn(sale, [], selection(1.5));
  assert.deepEqual(first.errors, []);
  assert.equal(first.totalRefund, 150);
  const prior = [{
    saleId: sale.id, status: "completed",
    items: [{ saleItemId: "line-area", quantity: 1.5, refundAmount: 150 }],
  }];
  const remaining = quoteSaleReturn(sale, prior, selection(1.5));
  assert.deepEqual(remaining.errors, []);
  assert.equal(remaining.totalRefund, 150);
  const excessive = quoteSaleReturn(sale, prior, selection(1.501));
  assert.ok(excessive.errors.length);
  assert.equal(excessive.totalRefund, 0);
});

test("forged immutable dimensional sale-line audit refuses any refund or exchange quote", () => {
  for (const damaged of [
    {...audit,length:"13"},
    {...audit,width:"17"},
    {...audit,quantityMilli:2999},
    {...audit,algorithm:"area-v2"},
    {...audit,schema:"dimension-line-v2"},
    {...audit,pieces:3},
    {...audit,extra:true},
    {...audit,length:'<img onerror="alert(1)">'},
  ]) {
    const result = quoteSaleReturn(invoice({dimensionMetadata: damaged}), [], selection(1.5));
    assert.ok(result.errors.some(e => /dimension|invalid|unsafe/i.test(e)),
      "Forged audit must fail: "+JSON.stringify(damaged));
    assert.equal(result.totalRefund, 0, "Failed quote cannot authorize refund");
    assert.deepEqual(result.items,[], "Failed quote cannot create refundable items");
  }
});

test("sub-milli forged area invoice and old non-dimensional sales remain separate", () => {
  const changedQty = quoteSaleReturn(invoice({quantity:3.0004}), [], selection(1));
  assert.ok(changedQty.errors.length);
  assert.equal(changedQty.totalRefund, 0);
  const plain = quoteSaleReturn(invoice({dimensionMetadata: null}), [], selection(1.5));
  assert.deepEqual(plain.errors, []);
  assert.equal(plain.totalRefund, 150);
});
