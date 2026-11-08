import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const root = new URL("../packages/business-logic/src/", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");
const source = read("barcode-labels.ts");
const result = ts.transpileModule(source, {compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
},reportDiagnostics:true});
assert.equal(result.diagnostics?.length || 0,0,"Label TypeScript must transpile cleanly");
let prefs = {labelWidthMm:38,labelHeightMm:38,labelColumns:2,labelRollWidthMm:101.6,
  labelGapMm:3,labelLeftMarginMm:11.3,labelRowGapMm:0,labelCodeMode:"barcode",labelLayout:"compact"};
const m={exports:{}};
const sent=[];
const lookup=(id)=>{
  if(id==="./shop-profile")return {getShopProfile:()=>({shopName:"ERA WARDROBE"})};
  if(id==="@minarvabiz/utils")return {formatMoney:(n)=>"Rs."+Number(n).toFixed(2)};
  if(id==="./html")return {escapeHtml:(s)=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")};
  if(id==="./print-settings")return {getPrintSettings:()=>prefs};
  if(id==="./desktop-print")return {tryDesktopPrintHtml:()=>true,requestDesktopPrintHtml:(html,paper,opts)=>{sent.push({html,paper,opts});return Promise.resolve({ok:true});}};
  if(id==="./qr-code")return {qrSvg:()=>"<svg class='qr-svg'></svg>"};
  throw Error("unexpected import "+id);
};
vm.runInThisContext(`(function(require,module,exports){\n${result.outputText}\n})`)(lookup,m,m.exports);
const product={id:"p1",name:"Kurti",barcode:"2907885160674",size:"M",color:"Red",fabric:"Cotton",mrp:999,sellingPrice:799};
const html=m.exports.buildBarcodeLabelHtml(product,{copies:3,autoPrint:false});
assert.match(html,/@page\{size:101\.6mm 38mm;margin:0\}/);
assert.match(html,/grid-template-columns:repeat\(2,38mm\)/);
assert.match(html,/column-gap:3mm/);
assert.match(html,/padding-left:11\.3mm/);
assert.equal((html.match(/class="label-sheet"/g)||[]).length,2);
assert.equal((html.match(/class="label compact/g)||[]).length,3);
for (const field of ["Size: M","Colour: Red","Material: Cotton","Price: Rs.999.00"])
  assert.equal(html.split(field).length - 1,3,field+" on all labels");
assert.doesNotMatch(html,/Offer:|MRP:/);
assert.doesNotMatch(html,/window\.print\(\)/);
assert.match(html,/\.label-sheet:last-child\{break-after:auto;page-break-after:auto\}/);
prefs={...prefs,labelRowGapMm:2};
const withGap=m.exports.buildBarcodeLabelHtml(product,{copies:2,autoPrint:false});
assert.match(withGap,/@page\{size:101\.6mm 40mm;margin:0\}/);
prefs={...prefs,labelRowGapMm:0,labelColumns:1};
const single=m.exports.buildBarcodeLabelHtml(product,{copies:1,autoPrint:false});
assert.match(single,/@page\{size:38mm 38mm;margin:0\}/);
assert.match(single,/grid-template-columns:repeat\(1,38mm\)/);
prefs={...prefs,labelColumns:2,labelRollWidthMm:70};
assert.throws(()=>m.exports.buildBarcodeLabelHtml(product,{copies:1}),/exceed/);

// Same document as the in-app preview must be submitted directly to the
// configured Windows printer, bypassing the OS dialog's missing preview.
const previousWindow=globalThis.window;
try {
  globalThis.window={};
  prefs={...prefs,labelColumns:2,labelRollWidthMm:101.6,labelWidthMm:38,labelHeightMm:38,
    labelPrinterName:"QA Label Printer",thermalPrinterName:""};
  const direct=await m.exports.sendBarcodeLabelsToPrinter(product,3);
  assert.deepEqual(direct,{ok:true});
  assert.equal(sent.length,1);
  assert.equal(sent[0].paper,"label");
  assert.deepEqual(sent[0].opts,{labelWidthMm:101.6,labelHeightMm:38,silent:true});
  assert.match(sent[0].html,/grid-template-columns:repeat\(2,38mm\)/);
  assert.equal((sent[0].html.match(/class="label-sheet"/g)||[]).length,2);
  prefs={...prefs,labelPrinterName:"",thermalPrinterName:""};
  assert.match((await m.exports.sendBarcodeLabelsToPrinter(product,2)).error,/Select the dedicated Barcode label printer/);
  assert.equal(sent.length,1,"Refuse direct printing without a configured label printer");
} finally {
  if(previousWindow===undefined)delete globalThis.window;
  else globalThis.window=previousWindow;
}
const modal=fs.readFileSync(new URL("../apps/desktop/src/components/BarcodeLabelPrintModal.tsx",import.meta.url),"utf8");
assert.match(modal,/Use 4-inch roll — 2 stickers per row/);
assert.match(modal,/srcDoc=\{preview.html\}/);
assert.match(modal,/sendBarcodeLabelsToPrinter\(product, count, categoryName\)/);

const settings=fs.readFileSync(new URL("../packages/ui/src/components/settings/SettingsPanel.tsx",import.meta.url),"utf8");
assert.match(settings,/savedProfileKey = JSON\.stringify\(profile\)/);
assert.doesNotMatch(settings,/setDraftProfile\(profile\), \[profile\]/);
assert.match(settings,/Use 4″ roll — 2 × 38 mm stickers/);

// The customer's actual CROMO roll: 38×25 mm stickers, 2-up, NO GAP.
// 80 mm backing and 2 mm side offsets are adjustable calibration defaults.
const presetSource=read("print-settings.ts");
const presetCompiled=ts.transpileModule(presetSource,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
},reportDiagnostics:true});
assert.equal(presetCompiled.diagnostics?.length||0,0);
const presetModule={exports:{}};
const presetLookup=id=>{
  if(id==="@minarvabiz/utils")return {nowISO:()=>new Date().toISOString()};
  if(id==="./autosave")return {touchPersistence:()=>{}};
  if(id==="./print-templates")return {defaultPrintTemplates:()=>[],
    normalizePrintTemplates:x=>x,sanitizePrintTemplate:x=>x};
  throw Error("Unexpected print-settings dependency: "+id);
};
vm.runInThisContext(`(function(require,module,exports){\n${presetCompiled.outputText}\n})`)(presetLookup,presetModule,presetModule.exports);
const cromo=presetModule.exports.CROMO_38X25_2UP_NOGAP_PRESET;
assert.deepEqual({...cromo},{labelWidthMm:38,labelHeightMm:25,labelColumns:2,
  labelRollWidthMm:80,labelGapMm:0,labelLeftMarginMm:2,labelRowGapMm:0,
  labelCodeMode:"both",labelLayout:"compact"});
const actual=presetModule.exports.updatePrintSettings(cromo);
assert.equal(actual.labelHeightMm,25);
assert.equal(actual.labelGapMm,0);
assert.equal(actual.labelPrinterName,"","A label preset must never guess or overwrite the device");
prefs={...prefs,...cromo,labelPrinterName:"QA CROMO printer",thermalPrinterName:""};
const chromoHtml=m.exports.buildBarcodeLabelHtml(product,{copies:3,autoPrint:false});
assert.match(chromoHtml,/@page\{size:80mm 25mm;margin:0\}/);
assert.match(chromoHtml,/grid-template-columns:repeat\(2,38mm\)/);
assert.match(chromoHtml,/column-gap:0mm/);
assert.match(chromoHtml,/padding-left:2mm/);
assert.equal((chromoHtml.match(/class="label-sheet"/g)||[]).length,2);
assert.equal((chromoHtml.match(/label compact short/g)||[]).length,3);
assert.match(chromoHtml,/\.label.short\{padding:1.1mm .85mm 1.2mm;gap:.1mm;min-height:0\}/);
for(const field of ["Size: M","Colour: Red","Material: Cotton","Price: Rs.999.00"])
 assert.equal(chromoHtml.split(field).length-1,3,"Chromo short labels keep "+field);
assert.doesNotMatch(chromoHtml,/Offer:|MRP:/);
const twoStickers=m.exports.buildBarcodeLabelHtml(product,{copies:2,autoPrint:false});
assert.match(twoStickers,/@page\{size:80mm 25mm;margin:0\}/,
  "Two CROMO stickers across must be ONE physical print row");
assert.equal((twoStickers.match(/class="label-sheet"/g)||[]).length,1);
assert.equal((twoStickers.match(/<svg class=['"]qr-svg/g)||[]).length,2,
  "Each of the two labels must include a QR");
assert.match(twoStickers,/\.label-sheet:last-child\{break-after:auto;page-break-after:auto\}/);
// Long-run regression: 40 stickers on a 38x25 2-up roll form 20
// independent 27 mm physical row-pitch pages, not one scaled 540 mm page.
// Driver payload assertions do NOT substitute for hardware feed testing.
prefs={...prefs,labelRowGapMm:2};
const forty=m.exports.buildBarcodeLabelHtml(product,{copies:40,autoPrint:false});
assert.match(forty,/@page\{size:80mm 27mm;margin:0\}/);
assert.match(forty,/grid-template-columns:repeat\(2,38mm\)/);
assert.equal((forty.match(/class="label-sheet"/g)||[]).length,20,"40 stickers must have 20 media pages");
assert.equal((forty.match(/class="label compact short"/g)||[]).length,40,"All stickers must be present");
assert.equal((forty.match(/<svg class=['"]qr-svg/g)||[]).length,40,"QR on every sticker");
assert.equal((forty.match(/class="barcode-svg"/g)||[]).length,40,"Barcode on every sticker");
for(const field of ["Size: M","Colour: Red","Material: Cotton","Price: Rs.999.00"])
  assert.equal(forty.split(field).length-1,40,"All 40 stickers preserve "+field);
assert.doesNotMatch(forty,/Offer:|MRP:|window\.print\(\)/);
assert.match(forty,/\.label-sheet\{break-after:page;page-break-after:always\}/);
const odd=m.exports.buildBarcodeLabelHtml(product,{copies:41,autoPrint:false});
assert.equal((odd.match(/class="label-sheet"/g)||[]).length,21,"Last unpaired sticker must form a row");
assert.equal((odd.match(/class="label compact short"/g)||[]).length,41);
prefs={...prefs,labelRowGapMm:0};

try{
 globalThis.window={};
 const result=await m.exports.sendBarcodeLabelsToPrinter(product,3);
 assert.deepEqual(result,{ok:true});
 assert.deepEqual(sent.at(-1).opts,{labelWidthMm:80,labelHeightMm:25,silent:true});
 assert.equal(sent.at(-1).html,chromoHtml,"WYSIWYG preview and print payload must be identical");
}finally{
 if(previousWindow===undefined)delete globalThis.window;
 else globalThis.window=previousWindow;
}
const modalSource=fs.readFileSync(new URL("../apps/desktop/src/components/BarcodeLabelPrintModal.tsx",import.meta.url),"utf8");
const settingsSource=fs.readFileSync(new URL("../packages/ui/src/components/settings/SettingsPanel.tsx",import.meta.url),"utf8");
assert.match(modalSource,/Use CROMO 38×25 — 2-up \/ NO GAP/);
assert.match(modalSource,/\.\.\.CROMO_38X25_2UP_NOGAP_PRESET/);
assert.match(modalSource,/previouslyCalibrated/);
assert.match(settingsSource,/CROMO_38X25_2UP_NOGAP_PRESET/);
assert.match(settingsSource,/col === 0 \? "LEFT" : "RIGHT"/);

const printDocument=read("print-document-render.ts");
assert.match(printDocument,/\.top\{display:block;text-align:center/);
assert.match(printDocument,/\.brand\{text-align:center/);
const license=fs.readFileSync(new URL("../apps/desktop/src/components/DesktopLicenseView.tsx",import.meta.url),"utf8");
assert.match(license,/return \{ ok, error: ok \? undefined : value\.reason/);
const electron=fs.readFileSync(new URL("../apps/desktop/electron/license.ts",import.meta.url),"utf8");
assert.match(electron,/https:\/\/minarva-biz-license-edge\.minarva-biz\.workers\.dev/);
console.log("2-up roll, 38mm stickers, receipt header, stable settings, activation feedback PASS");
