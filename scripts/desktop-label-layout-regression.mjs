import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const source = fs.readFileSync(new URL("../packages/business-logic/src/barcode-labels.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length || 0, 0);
let layout = "compact";
let codeMode = "both";
const module = { exports: {} };
const requireModule = (id) => {
  if (id === "./shop-profile") return { getShopProfile: () => ({ shopName: "ERA WARDROBE" }) };
  if (id === "@minarvabiz/utils") return { formatMoney: (amount) => "Rs." + Number(amount).toFixed(2) };
  if (id === "./html") return { escapeHtml: (value) => String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;") };
  if (id === "./print-settings") return { getPrintSettings: () => ({ labelWidthMm: 50, labelHeightMm: 30, labelCodeMode: codeMode, labelLayout: layout }) };
  if (id === "./desktop-print") return { tryDesktopPrintHtml: () => true };
  if (id === "./qr-code") return { qrSvg: () => '<svg class="qr-svg" viewBox="0 0 20 20"></svg>' };
  throw new Error("Unexpected module import: " + id);
};
vm.runInThisContext(`(function (require, module, exports) {\n${compiled.outputText}\n})`)(requireModule, module, module.exports);

const product = { id: "test", sku: "SKU-123", barcode: "2907885160674", name: "Test Dress", size: "XL", mrp: 399, sellingPrice: 300 };
const build = module.exports.buildBarcodeLabelHtml;

const html = build(product, { copies: 3, categoryName: "Dresses", autoPrint: false });
assert.match(html, /@page\{size:50mm 90mm;margin:0\}/);
assert.equal((html.match(/class="label compact/g) || []).length, 3, "Expected three stickers on a single continuous 90mm print strip");
assert.equal((html.match(/class="offer-price">Offer: Rs\.300\.00/g) || []).length, 3, "Special offer price must appear on every sticker");
assert.equal((html.match(/class="mrp-price">MRP: Rs\.399\.00/g) || []).length, 3, "MRP must appear on every sticker");
assert.match(html, /\.price\{flex:0 0 auto;/, "Price row must not shrink under barcodes");
assert.match(html, /\.label\.compact \.meta,\.label\.compact \.sku/, "Compact layout hides details to reserve price area");
assert.doesNotMatch(html, /window\.print\(\)/, "In-app preview must never invoke Windows preview");
assert.match(html, /class="codes both"/);
assert.equal((html.match(/class="label-sheet"/g)||[]).length,3);
assert.doesNotMatch(html, /page-break-after:always|break-after:page/);

layout = "detailed";
const detailed = build(product, { copies: 1, autoPrint: false, labelWidthMm: 40, labelHeightMm: 20 });
assert.match(detailed, /class="label detailed short"/);
assert.match(detailed, /@page\{size:40mm 20mm;margin:0\}/);
assert.match(detailed, /Offer: Rs\.300\.00/);
assert.match(detailed, /MRP: Rs\.399\.00/);
assert.match(detailed, /\.label\.short \.shop,\.label\.short \.meta/, "Small labels must hide nonessential details");
codeMode = "barcode";
const barcodeOnly = build(product, { copies: 1, autoPrint: false });
assert.match(barcodeOnly, /class="codes barcode"/);
assert.doesNotMatch(barcodeOnly, /<div class="qr">/);
console.log("Windows sticker layout, exact paper size, copies and price regression PASS");
