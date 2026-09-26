import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const templates = require("../print-templates.ts");
const renderer = require("../print-document-render.ts");
const settings = require("../print-settings.ts");
const labels = require("../barcode-labels.ts");
const qr = require("../qr-code.ts");

const defaults = templates.defaultPrintTemplates();
assert.equal(defaults.length, 4);
for (const kind of ["invoice", "quotation"]) {
  for (const paper of ["a4", "thermal"]) {
    const matches = defaults.filter((item) => item.documentKind === kind && item.paper === paper);
    assert.equal(matches.length, 1, `default ${kind}/${paper}`);
    assert.equal(matches[0].isDefault, true);
  }
}

require("../shop-profile.ts").updateShopProfile({ gstin: "32ABCDE1234F1Z5" });
const sample = renderer.buildTemplateSampleHtml(defaults.find((item) => item.id === "system-invoice-a4"));
assert.match(sample, /INV-MT-2026-27-00001/);
assert.match(sample, /GSTIN/);
assert.match(sample, /Authorised Signatory/);
assert.match(sample, /Terms & Conditions/);

settings.hydratePrintSettings({
  defaultInvoicePaper: "a4",
  thermalWidthMm: 80,
  labelWidthMm: 50,
  labelHeightMm: 30,
});
assert.equal(settings.listPrintTemplates().length, 4, "legacy settings receive professional defaults");
assert.equal(settings.getPrintSettings().labelCodeMode, "both");

const matrix = qr.qrMatrix("ABC-123");
assert.ok(matrix.length >= 21 && matrix.length <= 33);
assert.equal(matrix.length, matrix[0].length);
assert.equal(matrix[0][0], true, "top-left finder");
assert.equal(matrix[6][6], true, "top-left finder center edge");

settings.updatePrintSettings({ labelCodeMode: "both" });
const product = {
  id: "product-1",
  categoryId: null,
  name: "QA Label Product",
  sku: "SKU-ABC",
  barcode: "ABC-123",
  brand: "Minarva",
  fabric: null,
  size: "M",
  color: "Blue",
  unit: "pcs",
  costPrice: 100,
  sellingPrice: 150,
  discountPercent: 0,
  taxRate: 5,
  stockQuantity: 10,
  minimumStock: 1,
  supplierId: null,
  imageUrl: null,
  notes: null,
  isActive: true,
  createdAt: "2026-09-26T00:00:00.000Z",
  updatedAt: "2026-09-26T00:00:00.000Z",
  deletedAt: null,
  branchId: null,
  deviceId: null,
  version: 1,
};

const code128Label = labels.buildBarcodeLabelHtml(product, { autoPrint: false });
assert.match(code128Label, /Code 128 ABC-123/);
assert.match(code128Label, /class="qr-svg"/);
assert.match(code128Label, /Barcode \+ QR|codes both|class="codes both"/);

const ean = labels.generateProductBarcode([]);
assert.equal(labels.isValidEan13(ean), true);
const eanLabel = labels.buildBarcodeLabelHtml({ ...product, barcode: ean }, { autoPrint: false });
assert.match(eanLabel, /EAN-13/);
assert.match(eanLabel, /class="qr-svg"/);

console.log("Print templates + barcode/QR label contract PASS");
