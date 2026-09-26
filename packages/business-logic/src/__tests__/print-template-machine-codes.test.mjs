import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const templates = require("../print-templates.ts");
const codes = require("../machine-codes.ts");
const labels = require("../barcode-labels.ts");

const defaults = templates.listPrintTemplates();
assert.equal(defaults.length, 4);
for (const doc of ["invoice", "quotation"]) {
  for (const paper of ["a4", "thermal"]) {
    const template = templates.getPrintTemplate(doc, paper);
    assert.equal(template.documentType, doc);
    assert.equal(template.paper, paper);
    assert.ok(template.title);
    assert.ok(template.labels.documentNumber);
  }
}

const custom = templates.createPrintTemplate({
  documentType: "invoice",
  paper: "a4",
  name: "QA Custom Invoice",
  sourceTemplateId: "tpl-invoice-a4-professional",
});
assert.equal(custom.name, "QA Custom Invoice");
const edited = templates.updatePrintTemplate(custom.id, { title: "RETAIL INVOICE", showWebsite: false, accentColor: "#123456" });
assert.equal(edited.title, "RETAIL INVOICE");
assert.equal(edited.showWebsite, false);
assert.equal(edited.accentColor, "#123456");
const removed = templates.deletePrintTemplate(custom.id);
assert.equal(removed.deleted, true);
assert.ok(removed.replacement);

const code128 = codes.code128Svg("SKU-ABC-123");
assert.match(code128, /class="barcode-svg"/);
assert.match(code128, /<rect/);
assert.match(code128, /SKU-ABC-123/);

const qr = codes.qrSvg("MBIZ-2900000001");
assert.match(qr, /class="qr-svg"/);
assert.ok((qr.match(/<rect/g) || []).length > 80);

const labelHtml = labels.buildBarcodeLabelHtml({
  id: "product-qa",
  name: "QA Product",
  sku: "SKU-ABC-123",
  barcode: "CUSTOM-ABC-123",
  categoryId: null,
  brand: null,
  size: null,
  color: null,
  fabric: null,
  unit: "pcs",
  costPrice: 50,
  sellingPrice: 100,
  discount: 0,
  taxRate: 0,
  stockQuantity: 5,
  minimumStock: 1,
  supplierId: null,
  imageUrl: null,
  notes: null,
  isActive: true,
  createdAt: "2026-09-26T00:00:00.000Z",
  updatedAt: "2026-09-26T00:00:00.000Z",
  version: 1,
}, { autoPrint: false });
assert.match(labelHtml, /class="barcode-svg"/);
assert.match(labelHtml, /class="qr-svg"/);

console.log("Print templates + Code128 + QR label rendering PASS");
