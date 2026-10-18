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
const {
  isAreaBillableProduct,
  attachNormalAreaMeasurement,
  appendNormalBillingLine,
}=require("../normal-area-billing.ts");

const baseProduct=(unit="sqft")=>({
  id:"fabric-area",name:"Panel",unit,stockQuantity:10,sellingPrice:100,
  costPrice:50,discount:0,taxRate:0,isActive:true,
});
const baseLine=(quantity=1)=>({
  productId:"fabric-area",productName:"Panel",quantity,unitPrice:100,costPrice:50,
  discountPercent:0,taxRate:0,stockQuantity:10,
});
const preview=(billableUnit="sqft")=>previewDimensionRow({
  length:"12",width:"18",lengthUnit:"in",widthUnit:"in",
  billableUnit,pieces:"2",
});
test("normal billing offers measurement editor only when product stock unit is area",()=>{
  assert.equal(isAreaBillableProduct(baseProduct("sqft")),true);
  assert.equal(isAreaBillableProduct(baseProduct("sqm")),true);
  for(const unit of ["pieces","pcs","m","sq ft","",null,undefined]) {
    assert.equal(isAreaBillableProduct(baseProduct(unit)),false);
  }
});

test("measurement must be applied canonically, recalculated and match stock unit",()=>{
  const p=preview();
  assert.equal(p.valid,true);
  const line=attachNormalAreaMeasurement(baseLine(1),baseProduct(),p.measurement);
  assert.equal(line.quantity,3);
  assert.deepEqual(line.dimensionMetadata,{
    schema:"dimension-line-v1",algorithm:"area-v1",length:"12",width:"18",
    lengthUnit:"in",widthUnit:"in",billableUnit:"sqft",pieces:2,quantityMilli:3000,
  });
  assert.equal(Object.isFrozen(line.dimensionMetadata),true);
  assert.throws(()=>attachNormalAreaMeasurement(baseLine(1),baseProduct("pcs"),p.measurement));
  assert.throws(()=>attachNormalAreaMeasurement(baseLine(1),baseProduct("sqm"),p.measurement));
  assert.throws(()=>attachNormalAreaMeasurement(baseLine(1),baseProduct(),null));
  assert.throws(()=>attachNormalAreaMeasurement(baseLine(1),baseProduct(),{...p.measurement,length:"13"}));
  assert.throws(()=>attachNormalAreaMeasurement(baseLine(1),baseProduct("sqft"),{
    ...p.measurement,quantityMilli:6000,quantity:6,
  }));
  assert.throws(()=>attachNormalAreaMeasurement(baseLine(1),{...baseProduct(),stockQuantity:2},p.measurement));
});

test("multiple cuts of one SKU cannot be coalesced and lose immutable audit",()=>{
  const p=preview(); assert.equal(p.valid,true);
  const area=attachNormalAreaMeasurement(baseLine(),baseProduct(),p.measurement);
  assert.deepEqual(appendNormalBillingLine([],area),[area]);
  for(const next of [area,baseLine(1)]) {
    assert.throws(()=>appendNormalBillingLine([area],next),/separate|measurement|area|combine/i);
  }
  assert.throws(()=>appendNormalBillingLine([baseLine(1)],area),/separate|measurement|area|combine/i);
  const normal=appendNormalBillingLine([baseLine(1)],baseLine(2));
  assert.equal(normal[0].quantity,3);
  assert.equal(normal[0].dimensionMetadata,undefined);
});

test("area billing field is visible in Normal Billing and quantity cannot be edited independently",()=>{
  const source=fs.readFileSync(new URL("../../../ui/src/components/sales/NormalBilling.tsx",import.meta.url),"utf8");
  assert.match(source,/DimensionRowEditor/);
  assert.match(source,/attachNormalAreaMeasurement/);
  assert.match(source,/dimensionLineMetadataFromMeasurement|dimensionMetadata/);
  assert.match(source,/disabled=\{Boolean\(line.dimensionMetadata\)\}/);
  assert.match(source,/appendNormalBillingLine/);
});
