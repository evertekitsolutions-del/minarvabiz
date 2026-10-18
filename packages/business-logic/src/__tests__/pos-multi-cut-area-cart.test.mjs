import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,filename)=>mod._compile(
  ts.transpileModule(fs.readFileSync(filename,"utf8"),{
    fileName:filename,compilerOptions:{
      module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
      esModuleInterop:true,inlineSourceMap:true,inlineSources:true,
    },
  }).outputText,filename
);
const {previewDimensionRow}=require("../dimensional-billing.ts");
const {appendPosMeasuredCut, removePosCartRow, updatePosCartDiscount}=require("../pos-area-cart.ts");
const product=(stockQuantity=5)=>({
  id:"panel",name:"Cut Panel",unit:"sqft",isActive:true,
  stockQuantity,sellingPrice:100,costPrice:60,discount:0,taxRate:0,
});
const measured=(length,width,pieces="1")=>{
  const preview=previewDimensionRow({
    length,width,lengthUnit:"in",widthUnit:"in",billableUnit:"sqft",pieces,
  });
  assert.equal(preview.valid,true);
  return preview.measurement;
};
const a=measured("12","18","2"); // 3 sqft
const b=measured("12","12","1"); // 1 sqft
test("different cuts of same SKU remain distinct, independently keyed immutable financial lines",()=>{
  const first=appendPosMeasuredCut([],product(),a,"cut-a");
  assert.equal(first.length,1);
  assert.equal(first[0].quantity,3);
  assert.equal(first[0].cartLineId,"cut-a");
  const both=appendPosMeasuredCut(first,product(),b,"cut-b");
  assert.equal(both.length,2);
  assert.deepEqual(both.map(l=>l.productId),["panel","panel"]);
  assert.deepEqual(both.map(l=>l.quantity),[3,1]);
  assert.deepEqual(both.map(l=>l.cartLineId),["cut-a","cut-b"]);
  assert.equal(both[0].dimensionMetadata.length,"12");
  assert.equal(both[0].dimensionMetadata.width,"18");
  assert.equal(both[1].dimensionMetadata.width,"12");
  assert.ok(Object.isFrozen(both[0].dimensionMetadata));
  assert.ok(Object.isFrozen(both[1].dimensionMetadata));
  assert.deepEqual(first,[both[0]],"appending a cut must not mutate previous cart snapshot");
  const restored=JSON.parse(JSON.stringify(both));
  assert.deepEqual(restored.map(x=>x.cartLineId),["cut-a","cut-b"]);
  assert.deepEqual(restored.map(x=>x.dimensionMetadata.quantityMilli),[3000,1000]);
});
test("cumulative stock demand across cuts cannot exceed product stock",()=>{
  const first=appendPosMeasuredCut([],product(3.999),a,"cut-a");
  assert.throws(()=>appendPosMeasuredCut(first,product(3.999),b,"cut-b"),/stock|quantity/i);
  const two=appendPosMeasuredCut(first,product(4),b,"cut-b");
  assert.equal(two.length,2);
  assert.throws(()=>appendPosMeasuredCut(two,product(4),b,"cut-c"),/stock|quantity/i);
  assert.throws(()=>appendPosMeasuredCut([],product(2.999),a,"cut-a"),/stock|quantity/i);
  assert.throws(()=>appendPosMeasuredCut([],product(NaN),a,"cut-a"),/stock|quantity/i);
});
test("unsupported area units, forged measurements and reused row identities refuse mutation",()=>{
  const first=appendPosMeasuredCut([],product(),a,"cut-a");
  assert.throws(()=>appendPosMeasuredCut(first,product(),b,"cut-a"),/duplicate|identity/i);
  assert.throws(()=>appendPosMeasuredCut(first,{...product(),unit:"pcs"},b,"cut-b"));
  assert.throws(()=>appendPosMeasuredCut(first,{...product(),unit:"sqm"},b,"cut-b"));
  assert.throws(()=>appendPosMeasuredCut(first,product(),{...b,width:"13"},"cut-b"));
  assert.throws(()=>appendPosMeasuredCut(first,product(),{...b,quantityMilli:2000,quantity:2},"cut-b"));
  assert.throws(()=>appendPosMeasuredCut(first,product(),b,""),/identity/i);
  assert.deepEqual(first.map(x=>x.cartLineId),["cut-a"]);
});
test("quantity is immutable for cuts while discount and removal target exact cut identity",()=>{
  const cuts=appendPosMeasuredCut(
    appendPosMeasuredCut([],product(),a,"cut-a"),product(),b,"cut-b");
  const changed=updatePosCartDiscount(cuts,"cut-b",12);
  assert.equal(changed[0].discountPercent,0);
  assert.equal(changed[1].discountPercent,12);
  assert.equal(changed[0].quantity,3);
  assert.equal(changed[1].quantity,1);
  const removed=removePosCartRow(changed,"cut-a");
  assert.deepEqual(removed.map(x=>x.cartLineId),["cut-b"]);
  assert.equal(cuts.length,2);
  assert.deepEqual(removePosCartRow(cuts,"no-such-id"),cuts);
});
test("POS UI uses measured editor, stable cut keys, per-cut controls and scan protection",()=>{
  const source=fs.readFileSync(new URL("../../../ui/src/components/sales/PosBilling.tsx",import.meta.url),"utf8");
  assert.match(source,/DimensionRowEditor/);
  assert.match(source,/appendPosMeasuredCut/);
  assert.match(source,/isAreaBillableProduct/);
  assert.match(source,/cartLineId \?\? line.productId/);
  assert.match(source,/disabled=\{Boolean\(line.dimensionMetadata\)\}/);
  assert.match(source,/removePosCartRow/);
  assert.match(source,/updatePosCartDiscount/);
  assert.match(source,/parseFloat\(e.target.value\)/);
  assert.doesNotMatch(source,/parseInt\(e.target.value,\s*10\)/);
  assert.match(source,/held\.lines\.map/);
});
