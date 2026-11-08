import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  },
).outputText, filename);
const settings = require("../print-settings.ts");
const labels = require("../barcode-labels.ts");
const native = require("../desktop-print.ts");
const renderer = require("../print-document-render.ts");
const templates = require("../print-templates.ts");

const product = {
  id:"p",name:"SALWAR 11479",sku:"SALWAR-11479",barcode:labels.generateProductBarcode([]),
  size:"XL",color:"GREEN",fabric:"COTTON",brand:"Fashion",mrp:2595,sellingPrice:2595,
};
const calls = [];
globalThis.window = { minarvaDesktop: {
  printHtml: async args => { calls.push(args); return {ok:true}; }
} };

test("a thermal receipt printer is never silently substituted for the barcode-label device", async () => {
  settings.hydratePrintSettings({...settings.CROMO_38X25_2UP_NOGAP_PRESET,
    defaultInvoicePaper:"thermal",thermalWidthMm:80,
    labelPrinterName:"",thermalPrinterName:"POSIFLEX-80",silentDesktopPrint:true});
  const refused = await labels.sendBarcodeLabelsToPrinter(product,2);
  assert.equal(refused.ok,false);
  assert.match(refused.error,/dedicated Barcode label printer/i);
  assert.equal(calls.length,0,"The receipt printer must not receive a label job");
  const refusedBridge = await native.requestDesktopPrintHtml("<p>BARCODE</p>","label");
  assert.equal(refusedBridge?.ok,false);
  assert.equal(calls.length,0,"The generic native print bridge must also reject label fallback");
});

test("two 38x25 2-UP labels are exactly one print page, with QR and size",async()=>{
  settings.updatePrintSettings({...settings.CROMO_38X25_2UP_NOGAP_PRESET,
    labelPrinterName:"CROMO-Label",thermalPrinterName:"POSIFLEX-80"});
  const html=labels.buildBarcodeLabelHtml(product,{copies:2,autoPrint:false});
  assert.match(html,/@page\{size:80mm 25mm;margin:0\}/);
  assert.equal((html.match(/class="label-sheet"/g)||[]).length,1);
  assert.equal((html.match(/class="label compact short"/g)||[]).length,2);
  assert.equal((html.match(/class="qr-svg"/g)||[]).length,2);
  assert.equal((html.match(/Size: XL/g)||[]).length,2);
  assert.equal((html.match(/Colour: GREEN/g)||[]).length,2);
  assert.equal((html.match(/Material: COTTON/g)||[]).length,2);
  assert.match(html,/\.label-sheet:last-child\{break-after:auto;page-break-after:auto\}/);
  const before=calls.length;
  const sent=await labels.sendBarcodeLabelsToPrinter(product,2);
  assert.deepEqual(sent,{ok:true});
  assert.equal(calls.length,before+1);
  assert.equal(calls.at(-1).deviceName,"CROMO-Label");
  assert.equal(calls.at(-1).paper,"label");
  assert.deepEqual([calls.at(-1).labelWidthMm,calls.at(-1).labelHeightMm],[80,25]);
  assert.equal(calls.at(-1).html,html);
});

test("longer requests use one continuous strip and preserve physical row pitch",async()=>{
  settings.updatePrintSettings({labelRowGapMm:2});
  const html=labels.buildBarcodeLabelHtml(product,{copies:4,autoPrint:false});
  assert.match(html,/@page\{size:80mm 27mm;margin:0\}/);
  assert.equal((html.match(/class="label-sheet"/g)||[]).length,2);
  assert.equal((html.match(/class="qr-svg"/g)||[]).length,4);
  assert.deepEqual(await labels.sendBarcodeLabelsToPrinter(product,4),{ok:true});
  assert.equal(calls.at(-1).labelHeightMm,27);
});

test("thermal invoices do not force 297 mm CSS or route to default printer",()=>{
  const template=templates.defaultPrintTemplates().find(x=>x.paper==="thermal"&&x.documentKind==="invoice");
  const css=renderer.documentCss(template,"80mm");
  assert.match(css,/@page\{size:auto;margin:0\}/);
  assert.doesNotMatch(css,/297mm/);
  const bridge=fs.readFileSync(new URL("../desktop-print.ts",import.meta.url),"utf8");
  assert.match(bridge,/if \(paper === "label"\) return settings.labelPrinterName;/);
  const main=fs.readFileSync(new URL("../../../../apps/desktop/electron/main.ts",import.meta.url),"utf8");
  assert.match(main,/thermalPageHeightMm = Math.min\(290/);
  assert.match(main,/documentMetrics.heightPx \* 25\.4 \/ 96/);
  assert.match(main,/deviceName: deviceName \|\| undefined/);
  assert.match(main,/height: thermalPageHeightMm \* 1000/);
  assert.doesNotMatch(main,/height: 297000/);
});
