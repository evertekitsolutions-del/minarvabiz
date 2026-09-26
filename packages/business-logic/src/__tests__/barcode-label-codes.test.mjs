import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);


const labels = require("../barcode-labels.ts");
const settings = require("../print-settings.ts");
const qr = require("../qr-code.ts");

settings.updatePrintSettings({ labelCodeMode: "both", labelWidthMm: 50, labelHeightMm: 30 });
const product = {
  id: "product-test",
  name: "QA Label Product",
  sku: "SKU-ABC-123",
  barcode: "ABC-123-XYZ",
  categoryId: null,
  brand: "Minarva",
  size: "M",
  color: "Blue",
  fabric: null,
  parentProductId: null,
  hasVariants: false,
  unit: "pcs",
  costPrice: 100,
  sellingPrice: 199,
  discount: 0,
  taxRate: 5,
  stockQuantity: 10,
  minimumStock: 1,
  supplierId: null,
  imageUrl: null,
  notes: null,
  isActive: true,
  createdAt: "2026-09-26T00:00:00.000Z",
  updatedAt: "2026-09-26T00:00:00.000Z",
};

const html = labels.buildBarcodeLabelHtml(product, { autoPrint: false });
assert.match(html, /class="barcode-svg"/);
assert.match(html, /Code 128/);
assert.match(html, /class="qr-svg"/);
assert.doesNotMatch(html, /No barcode/);
assert.doesNotMatch(html, /window\.print/);

const matrix = qr.qrMatrix("ABC-123-XYZ");
assert.ok(matrix.length >= 21);
assert.equal(matrix.length, matrix[0].length);
assert.ok(matrix.flat().filter(Boolean).length > 50);

console.log("Product labels: arbitrary Code128 + offline QR render PASS");

assert.throws(() => qr.qrMatrix("A".repeat(79)), /78 UTF-8 bytes/);
assert.throws(() => qr.qrMatrix("é".repeat(40)), /78 UTF-8 bytes/);
assert.match(labels.buildBarcodeLabelHtml({ ...product, barcode: "A".repeat(81) }, { autoPrint: false }), new RegExp("Code 128 " + "A".repeat(81)));
assert.match(labels.buildBarcodeLabelHtml({ ...product, barcode: "A".repeat(81) }, { autoPrint: false }), /shorten the product code/);
assert.match(labels.buildBarcodeLabelHtml({ ...product, barcode: "商品" }, { autoPrint: false }), /Use QR for non-ASCII/);
for (const mode of ["barcode", "qr", "both"]) {
  settings.updatePrintSettings({ labelCodeMode: mode });
  const output = labels.buildBarcodeLabelHtml(product, { autoPrint: false });
  assert.equal(output.includes('class="barcode-svg"'), mode !== "qr");
  assert.equal(output.includes('class="qr-svg"'), mode !== "barcode");
}
