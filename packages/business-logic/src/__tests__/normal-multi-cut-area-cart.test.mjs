import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"),{
    fileName:file,compilerOptions:{
      module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
      esModuleInterop:true,inlineSourceMap:true,inlineSources:true,
    },
  }).outputText,file
);
const {previewDimensionRow}=require("../dimensional-billing.ts");
const {cartLineToSaleItem,validateCart}=require("../sales.ts");
const {
  attachNormalAreaMeasurement,appendNormalBillingLine,
  updateNormalBillingLine,removeNormalBillingLine,
}=require("../normal-area-billing.ts");
const product=(stockQuantity=5)=>({
  id:"area-fabric",name:"Fabric",unit:"sqft",stockQuantity,
  sellingPrice:100,costPrice:40,taxRate:0,discount:0,
});
const original=(qty=1)=>({
  productId:"area-fabric",productName:"Fabric",quantity:qty,
  unitPrice:100,costPrice:40,discountPercent:0,taxRate:0,stockQuantity:5,
});
function preview(length,width,pieces="1"){
  const p=previewDimensionRow({
    length,width,lengthUnit:"in",widthUnit:"in",billableUnit:"sqft",pieces,
  });
  assert.equal(p.valid,true);
  return p.measurement;
}
const a=preview("12","18","2"),b=preview("12","12");
const cut=(id,measurement,stock=5)=>{
  const line=attachNormalAreaMeasurement(
    {...original(),stockQuantity:stock},product(stock),measurement);
  return {...line,cartLineId:id};
};
test("two different cuts of one product remain separate invoice items and immutable area audit",()=>{
  const first=appendNormalBillingLine([],cut("cut-one",a));
  const next=appendNormalBillingLine(first,cut("cut-two",b));
  assert.deepEqual(next.map(x=>x.productId),["area-fabric","area-fabric"]);
  assert.deepEqual(next.map(x=>x.cartLineId),["cut-one","cut-two"]);
  assert.deepEqual(next.map(x=>x.quantity),[3,1]);
  assert.equal(next[0].dimensionMetadata.width,"18");
  assert.equal(next[1].dimensionMetadata.width,"12");
  assert.ok(Object.isFrozen(next[0].dimensionMetadata));
  assert.deepEqual(first,[next[0]]);
  assert.deepEqual(validateCart(next),[]);
  const items=next.map((l,i)=>cartLineToSaleItem(l,"sale-1","line-"+i));
  assert.deepEqual(items.map(x=>x.id),["line-0","line-1"]);
  assert.deepEqual(items.map(x=>x.dimensionMetadata.quantityMilli),[3000,1000]);
  const held=JSON.parse(JSON.stringify(next));
  assert.deepEqual(held.map(x=>x.cartLineId),["cut-one","cut-two"]);
  assert.deepEqual(held.map(x=>x.dimensionMetadata.quantityMilli),[3000,1000]);
});
test("same SKU aggregate stock and identity rejection before financial mutation",()=>{
  const first=appendNormalBillingLine([],cut("cut-one",a,3.999));
  assert.throws(()=>appendNormalBillingLine(first,cut("cut-two",b,3.999)),/stock|quantity/i);
  assert.throws(()=>appendNormalBillingLine(first,cut("cut-one",b,5)),/identity|duplicate/i);
  assert.throws(()=>appendNormalBillingLine(first,cut("",b,5)),/identity|duplicate/i);
  assert.throws(()=>appendNormalBillingLine(first,cut("area-fabric",b,5)),/identity|duplicate/i);
  assert.throws(()=>appendNormalBillingLine(first,{...cut("cut-two",b,5),quantity:1.001}),/dimension|quantity|audit/i);
  assert.throws(()=>appendNormalBillingLine(first,{...cut("cut-two",b,5),dimensionMetadata:{...cut("x",b).dimensionMetadata,width:"13"}}),/dimension|quantity|audit/i);
  assert.deepEqual(first.map(x=>x.cartLineId),["cut-one"]);
});
test("old ordinary lines still aggregate; one ordinary row and multiple cuts cannot exceed shared stock",()=>{
  const ordinary=appendNormalBillingLine([],original(1));
  const merged=appendNormalBillingLine(ordinary,original(1.5));
  assert.equal(merged.length,1);
  assert.equal(merged[0].quantity,2.5);
  const mixed=appendNormalBillingLine(merged,cut("cut-one",b));
  assert.equal(mixed.length,2);
  assert.equal(mixed[0].quantity,2.5);
  assert.equal(mixed[1].quantity,1);
  assert.throws(()=>appendNormalBillingLine(mixed,cut("cut-two",a)),/stock|quantity/i);
  assert.throws(()=>appendNormalBillingLine(mixed,original(2)),/stock|quantity/i);
  // With an independently keyed measured row, an ordinary row is safe too.
  const measuredFirst=appendNormalBillingLine([cut("cut-one",b)],original(1));
  assert.deepEqual(measuredFirst.map(x=>x.quantity),[1,1]);
  assert.deepEqual(measuredFirst.map(x=>x.cartLineId),["cut-one",undefined]);
});
test("per-row edit/remove operations never modify sibling cuts or measurement quantity",()=>{
  const both=appendNormalBillingLine(
    appendNormalBillingLine([],cut("cut-one",a)),cut("cut-two",b));
  const priced=updateNormalBillingLine(both,"cut-two",{unitPrice:220});
  assert.deepEqual(priced.map(x=>x.unitPrice),[100,220]);
  assert.deepEqual(priced.map(x=>x.quantity),[3,1]);
  assert.equal(priced[0].dimensionMetadata.width,"18");
  assert.throws(()=>updateNormalBillingLine(both,"cut-two",{quantity:2}),/dimension|quantity/i);
  assert.throws(()=>updateNormalBillingLine(both,"cut-two",{dimensionMetadata:null}),/immutable|dimension|field/i);
  assert.throws(()=>updateNormalBillingLine(both,"cut-two",{cartLineId:"new"}),/identity|field/i);
  assert.throws(()=>updateNormalBillingLine(both,"cut-two",{unitPrice:NaN}),/price/i);
  assert.deepEqual(removeNormalBillingLine(priced,"cut-one").map(x=>x.cartLineId),["cut-two"]);
  assert.equal(both.length,2);
  const plain=appendNormalBillingLine(both,original(0.5));
  assert.deepEqual(updateNormalBillingLine(plain,"area-fabric",{quantity:0.999}).map(x=>x.quantity),[3,1,0.999]);
  assert.throws(()=>updateNormalBillingLine(plain,"area-fabric",{quantity:1.001}),/stock|quantity/i);
  assert.throws(()=>updateNormalBillingLine(plain,"area-fabric",{quantity:0.9999}),/quantity|precision/i);
});
test("NormalBilling renders keyed independent cuts and restricts edits to one cart identity",()=>{
  const source=fs.readFileSync(new URL("../../../ui/src/components/sales/NormalBilling.tsx",import.meta.url),"utf8");
  assert.match(source,/generateId\(\)/);
  assert.match(source,/cartLineId \?\? line.productId/);
  assert.match(source,/updateNormalBillingLine/);
  assert.match(source,/removeNormalBillingLine/);
  assert.match(source,/appendNormalBillingLine/);
  assert.match(source,/disabled=\{Boolean\(line.dimensionMetadata\)\}/);
  assert.doesNotMatch(source,/prev\.filter\(\(x\) => x\.productId !== line\.productId\)/);
  assert.doesNotMatch(source,/line\.productId === productId \? \{ \.\.\.line, \.\.\.patch \}/);
});
