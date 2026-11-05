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
const lookup=(id)=>{
  if(id==="./shop-profile")return {getShopProfile:()=>({shopName:"ERA WARDROBE"})};
  if(id==="@minarvabiz/utils")return {formatMoney:(n)=>"Rs."+Number(n).toFixed(2)};
  if(id==="./html")return {escapeHtml:(s)=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")};
  if(id==="./print-settings")return {getPrintSettings:()=>prefs};
  if(id==="./desktop-print")return {tryDesktopPrintHtml:()=>true};
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
for (const field of ["Size: M","Colour: Red","Material: Cotton","Offer: Rs.799.00","MRP: Rs.999.00"])
  assert.equal(html.split(field).length - 1,3,field+" on all labels");
assert.doesNotMatch(html,/window\.print\(\)/);
prefs={...prefs,labelRowGapMm:2};
const withGap=m.exports.buildBarcodeLabelHtml(product,{copies:2,autoPrint:false});
assert.match(withGap,/@page\{size:101\.6mm 40mm;margin:0\}/);
prefs={...prefs,labelRowGapMm:0,labelColumns:1};
const single=m.exports.buildBarcodeLabelHtml(product,{copies:1,autoPrint:false});
assert.match(single,/@page\{size:38mm 38mm;margin:0\}/);
assert.match(single,/grid-template-columns:repeat\(1,38mm\)/);
prefs={...prefs,labelColumns:2,labelRollWidthMm:70};
assert.throws(()=>m.exports.buildBarcodeLabelHtml(product,{copies:1}),/exceed/);

const settings=fs.readFileSync(new URL("../packages/ui/src/components/settings/SettingsPanel.tsx",import.meta.url),"utf8");
assert.match(settings,/savedProfileKey = JSON\.stringify\(profile\)/);
assert.doesNotMatch(settings,/setDraftProfile\(profile\), \[profile\]/);
assert.match(settings,/Use 4″ roll — 2 × 38 mm stickers/);

const printDocument=read("print-document-render.ts");
assert.match(printDocument,/\.top\{display:block;text-align:center/);
assert.match(printDocument,/\.brand\{text-align:center/);
const license=fs.readFileSync(new URL("../apps/desktop/src/components/DesktopLicenseView.tsx",import.meta.url),"utf8");
assert.match(license,/return \{ ok, error: ok \? undefined : value\.reason/);
const electron=fs.readFileSync(new URL("../apps/desktop/electron/license.ts",import.meta.url),"utf8");
assert.match(electron,/https:\/\/minarva-biz-license-edge\.minarva-biz\.workers\.dev/);
console.log("2-up roll, 38mm stickers, receipt header, stable settings, activation feedback PASS");
