import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"),{
    fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText,file,
);
const {inspectGs1Barcode}=require("../gs1-barcode-assistant.ts");
const upstream=require("../vendor/open-mercato/gtin.ts");

test("direct MIT Open Mercato GS1 algorithm matches EAN-13 and UPC-A samples",()=>{
  assert.equal(upstream.computeGs1CheckDigit("400638133393"),1);
  assert.equal(upstream.isValidGtin("ean13","4006381333931"),true);
  assert.equal(upstream.isValidGtin("ean13","4006381333930"),false);
  assert.equal(upstream.isValidGtin("upc","036000291452"),true);
  assert.equal(upstream.isValidGtin("ean8","96385074"),true);
  assert.equal(upstream.normalizeGtinValue("ean13","4006 38133 3931"),"4006381333931");
});

test("full manufacturer barcodes show pass and fail without mutating input",()=>{
 const valid=inspectGs1Barcode("4006 38133 3931","ean13");
 assert.deepEqual([valid.completeCode,valid.generated,valid.valid,valid.expectedCheckDigit],
   ["4006381333931",false,true,1]);
 const bad=inspectGs1Barcode("4006381333930","ean13");
 assert.deepEqual([bad.completeCode,bad.generated,bad.valid,bad.expectedCheckDigit],
   ["4006381333930",false,false,1]);
 assert.match(bad.explanation,/Invalid check digit/);
});

test("body-only EAN-8/EAN-13/UPC-A calculates correct check digit",()=>{
  for(const [kind,body,full] of [
    ["ean13","400638133393","4006381333931"],
    ["ean8","9638507","96385074"],
    ["upc","03600029145","036000291452"],
  ]){
    const result=inspectGs1Barcode(body,kind);
    assert.equal(result.generated,true);
    assert.equal(result.valid,true);
    assert.equal(result.completeCode,full);
    assert.match(result.explanation,/confirm the product manufacturer/);
  }
});

test("reject wrong lengths, nondigits, arbitrary types and unusually large inputs",()=>{
 for(const code of ["","1","12345678901234","ABCDEFGHIJKL","40063813339a","4=00638133393","1".repeat(81)]){
    assert.throws(()=>inspectGs1Barcode(code,"ean13"));
 }
 assert.throws(()=>inspectGs1Barcode("4006381333931","invalid"),/Choose EAN/);
});

test("ProductList shared Web/Windows UI shows assistant without writing or replacing Code128",()=>{
 const ui=fs.readFileSync(new URL("../../../ui/src/components/products/ProductGs1BarcodeAssistant.tsx",import.meta.url),"utf8");
 const host=fs.readFileSync(new URL("../../../ui/src/components/products/ProductList.tsx",import.meta.url),"utf8");
 assert.match(ui,/Check GS1 barcode/);
 assert.match(ui,/inspectGs1Barcode/);
 assert.match(ui,/does not assign a GTIN/);
 assert.match(host,/<ProductGs1BarcodeAssistant \/>/);
});

test("MIT third-party attribution traces adapted GTIN code to exact upstream revision",()=>{
 const notice=fs.readFileSync(new URL("../../../../THIRD_PARTY_NOTICES.md",import.meta.url),"utf8");
 assert.match(notice,/Open Mercato — adapted MIT GS1 GTIN validator/);
 assert.match(notice,/eb3193df03b9ce0b196be417fe265c1dc47c0868/);
});
