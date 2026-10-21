import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"),{
    fileName:file,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText,file,
);
const {normalizeLocalizedRfqQuantity,canonicalizeUnitCode}=require("../localized-rfq-input.ts");
const {parseLocaleNumber}=require("../vendor/open-mercato/number.ts");
const {buildRfqDraftPreview}=require("../rfq-draft-preview.ts");

test("Open Mercato MIT parsing is directly available in shared business logic",()=>{
  assert.equal(parseLocaleNumber("1 234,5","fr-FR"),1234.5);
  assert.equal(parseLocaleNumber("1.234,5","de-DE"),1234.5);
  assert.equal(parseLocaleNumber("1,234.5","en-IN"),1234.5);
  assert.equal(parseLocaleNumber("1,25","en-IN"),1.25);
  assert.equal(parseLocaleNumber("1 2","fr-FR"),null);
});

test("international thousandth quantities are converted to canonical three-decimal domain strings",()=>{
  const fixtures=[
    ["1,25","en-IN","1.25"],
    ["1.25","en-US","1.25"],
    ["1 234,500","fr-FR","1234.5"],
    ["1.234,500","de-DE","1234.5"],
    ["1,234.500","en-IN","1234.5"],
    ["0,001","fr-FR","0.001"],
    ["1,234","en-IN","1.234"],
    ["2","en-US","2"],
    ["1.234.567,125","de-DE","1234567.125"],
  ];
  for(const [raw,locale,expected] of fixtures){
    assert.equal(normalizeLocalizedRfqQuantity(raw,locale),expected,raw+" "+locale);
  }
});

test("reject malformed, overprecise, zero, negative, exponent and unsafe inputs",()=>{
  for(const raw of ["","0","-1","1e3","1E2","1,0001","1.0001","1 2","1,2,3","1,2.3.4",
    "=1+1","Infinity","NaN","1,","1.","9007199254740993","0.0001","0,0009"]){
    assert.throws(()=>normalizeLocalizedRfqQuantity(raw,"en-IN"),undefined,raw);
  }
  assert.throws(()=>normalizeLocalizedRfqQuantity("1","xx-XX"),/invalid locale/);
  assert.throws(()=>normalizeLocalizedRfqQuantity("1".repeat(81),"en-IN"),/invalid locale/);
});

test("Open Mercato unit aliases normalize RFQ display without altering catalog records",()=>{
  assert.equal(canonicalizeUnitCode("QTY"),"pc");
  assert.equal(canonicalizeUnitCode(" KG "),"kg");
  assert.equal(canonicalizeUnitCode(""),null);
  const supplier={id:"s",name:"Supplier",createdAt:"2026-01-01",updatedAt:"2026-01-01"};
  const product={id:"p",name:"Meters",unit:" QTY ",isActive:true,
    costPrice:100,sellingPrice:120,stockQuantity:10,minimumStock:1,
    createdAt:"2026-01-01",updatedAt:"2026-01-01"};
  const original=JSON.stringify(product);
  const preview=buildRfqDraftPreview({
    reference:"RFQ",supplierIds:["s"],lines:[{productId:"p",quantity:"1.25"}],
    requiredBy:"2026-12-31",notes:"",
  },[product],[supplier],"branch1");
  assert.equal(preview.rows[0].unit,"pc");
  assert.equal(preview.rows[0].quantity,1.25);
  assert.equal(JSON.stringify(product),original);
});

test("UI invokes the imported locale adapter before strict RFQ domain validation",()=>{
  const ui=fs.readFileSync(new URL("../../../ui/src/components/purchases/RfqDraftPanel.tsx",import.meta.url),"utf8");
  assert.match(ui,/normalizeLocalizedRfqQuantity\(line.quantity, quantityLocale\)/);
  assert.match(ui,/Quantity input locale/);
  assert.match(ui,/A single separator always means a decimal/);
  assert.match(ui,/value="fr-FR"/);
});

test("Open Mercato license attribution and exact upstream source pin are retained",()=>{
  const notice=fs.readFileSync(new URL("../../../../THIRD_PARTY_NOTICES.md",import.meta.url),"utf8");
  assert.match(notice,/eb3193df03b9ce0b196be417fe265c1dc47c0868/);
  assert.match(notice,/Open Mercato — verbatim MIT locale-number/);
  assert.match(notice,/Copyright \(c\) 2025-2026 Open Mercato contributors/);
});
