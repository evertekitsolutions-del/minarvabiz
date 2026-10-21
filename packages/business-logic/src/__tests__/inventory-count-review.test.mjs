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
const { createStockCountWorksheet } = require("../inventory-count-worksheet.ts");
const { reviewStockCountCsv, buildAuthorizedStockCountReview } =
  require("../inventory-count-review.ts");
const { setCurrentRole } = require("../permissions.ts");
const store = require("../store.ts");

const product = (id, patch = {}) => ({
  id, name: "Part " + id, sku: "SKU-" + id, barcode: "BC-" + id, unit: "pcs",
  stockQuantity: 3.125, createdAt: "2026-10-01", updatedAt: "2026-10-01",
  costPrice: 20, sellingPrice: 30, minimumStock: 2, taxRate: 18, isActive: true,
  ...patch,
});
const timestamp = "2026-10-21T12:30:00.000Z";
const countedCsv = (products, counts) => {
  let csv = createStockCountWorksheet(products, timestamp).csv;
  for (const [book, count, note = ""] of counts) {
    const oldRow = book + ',"","",""';
    assert.ok(csv.includes(oldRow));
    csv = csv.replace(oldRow, book + ',"' + count + '","","' + note + '"');
  }
  return csv;
};

test("physical count review computes signed milli-unit variances and pending lines without writes", () => {
  const products = [product("a"), product("b", { stockQuantity: 2 }), product("c", { stockQuantity: 0 })];
  const before = JSON.stringify(products);
  const csv = countedCsv(products, [["3.125", "1.125", "short"], ["2", "2"]]);
  const result = reviewStockCountCsv(csv, products);
  assert.equal(result.snapshotAt, timestamp);
  assert.equal(result.productCount, 3);
  assert.equal(result.countedCount, 2);
  assert.equal(result.uncountedCount, 1);
  assert.deepEqual(result.discrepancies.map(r => [
    r.productId, r.bookQuantity, r.countedQuantity, r.varianceQuantity, r.notes,
  ]), [["a", 3.125, 1.125, -2, "short"]]);
  assert.equal(JSON.stringify(products), before);
});

test("CSV handles Unicode, quoted commas, embedded quotes and multiline product names", () => {
  const products = [product("x", { name: 'വസ്തു, "batch"\nA' })];
  const csv = countedCsv(products, [["3.125", "3.126"]]);
  const result = reviewStockCountCsv("\uFEFF" + csv, products);
  assert.equal(result.discrepancies[0].varianceQuantity, 0.001);
  assert.equal(result.discrepancies[0].name, 'വസ്തു, "batch"\nA');
});

test("physical counts reject invalid precision, negatives, formulas and forged variance", () => {
  const products = [product("a")];
  for (const value of ["-1", "1.0001", "=2+2", "Infinity", "1e3", "9007199254740992"]) {
    assert.throws(() => reviewStockCountCsv(countedCsv(products, [["3.125", value]]), products));
  }
  const badVariance = countedCsv(products, [["3.125", "2"]]).replace('"2","",""', '"2","-2",""');
  assert.throws(() => reviewStockCountCsv(badVariance, products), /variance/i);
  assert.throws(() => reviewStockCountCsv(createStockCountWorksheet(products, timestamp).csv, products), /at least one/i);
});

test("changed book stock, foreign product, duplicate rows and missing products fail closed", () => {
  const products = [product("a"), product("b", { stockQuantity: 4 })];
  const csv = countedCsv(products, [["3.125", "1"]]);
  assert.throws(() => reviewStockCountCsv(csv, [product("a", { stockQuantity: 4 }), products[1]]), /changed/i);
  assert.throws(() => reviewStockCountCsv(csv, [product("a")]), /changed/i);
  const lines = csv.trimEnd().split("\r\n");
  const duplicate = [lines[0], lines[1], lines[1]].join("\r\n");
  assert.throws(() => reviewStockCountCsv(duplicate, products), /Duplicate/i);
  assert.throws(() => reviewStockCountCsv(csv.replace('"SKU-a"', '"FORGED"'), products), /identification/i);
  assert.throws(() => reviewStockCountCsv(csv.replace('"Product ID"', '"something else"'), products), /header/i);
});

test("host authorization and branch filter prevent foreign branch count review", () => {
  const old = store.exportCoreState();
  try {
    const local = product("local");
    const foreign = product("foreign", { branchId: "elsewhere" });
    store.hydrateCore({ products: [local, foreign] });
    const csv = countedCsv([local], [["3.125", "4"]]);
    setCurrentRole("cashier");
    assert.throws(() => buildAuthorizedStockCountReview(csv), /Permission denied/);
    setCurrentRole("manager");
    assert.equal(buildAuthorizedStockCountReview(csv).discrepancies.length, 1);
    assert.throws(() => buildAuthorizedStockCountReview(
      countedCsv([local, foreign], [["3.125", "4"]])
    ), /changed|foreign/i);
  } finally {
    setCurrentRole(null);
    store.hydrateCore(old);
  }
});

test("Web/Windows shared inventory UI exposes manual CSV variance review only", () => {
  const ui = fs.readFileSync(new URL("../../../ui/src/components/products/ProductList.tsx", import.meta.url), "utf8");
  assert.match(ui, /Review counted CSV/);
  assert.match(ui, /buildAuthorizedStockCountReview/);
  assert.match(ui, /can\("inventory.adjust"\)/);
  assert.doesNotMatch(ui, /adjustStockToQuantity\(/);
});
