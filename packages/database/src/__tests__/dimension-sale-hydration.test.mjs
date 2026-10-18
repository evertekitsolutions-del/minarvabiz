import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,filename)=>mod._compile(
  ts.transpileModule(fs.readFileSync(filename,"utf8"),{
    fileName:filename,compilerOptions:{
      module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,
      inlineSourceMap:true,inlineSources:true,
    },
  }).outputText,filename
);
const {mapSaleItem}=require("../client/mappers.ts");
const base=()=>({
  id:"item-a",sale_id:"sale-a",product_id:"product-a",product_name:"Fabric",
  quantity:"3.000",unit_price:120,cost_price:80,
  discount_percent:0,tax_rate:0,line_total:360,
});
const metadata=()=>({
  schema:"dimension-line-v1",algorithm:"area-v1",length:"12",width:"18",
  lengthUnit:"in",widthUnit:"in",billableUnit:"sqft",pieces:2,quantityMilli:3000,
});

test("read-side cloud sale item retains canonical immutable dimensional audit",()=>{
  const original=metadata();
  const mapped=mapSaleItem({...base(),dimension_metadata:original});
  assert.equal(mapped.quantity,3);
  assert.deepEqual(mapped.dimensionMetadata,original);
  assert.notEqual(mapped.dimensionMetadata,original);
  assert.ok(Object.isFrozen(mapped.dimensionMetadata));
  original.length="999";
  assert.equal(mapped.dimensionMetadata.length,"12");
  assert.deepEqual(JSON.parse(JSON.stringify(mapped)).dimensionMetadata,metadata());
});

test("ordinary sale rows remain byte-compatible without synthetic dimension metadata",()=>{
  const legacy=mapSaleItem(base());
  assert.equal(Object.hasOwn(legacy,"dimensionMetadata"),false);
  const nullValue=mapSaleItem({...base(),dimension_metadata:null});
  assert.deepEqual(nullValue,legacy);
});

test("reject forged, incomplete and unknown-version read metadata without silently hiding it",()=>{
  for(const broken of [
    {},
    [],
    false,
    "3 sqm",
    {...metadata(),schema:"dimension-line-v2"},
    {...metadata(),algorithm:"area-v2"},
    {...metadata(),lengthUnit:"yd"},
    {...metadata(),pieces:1.2},
    {...metadata(),quantityMilli:2999},
    {...metadata(),extra:true},
    {...metadata(),width:"NaN"},
  ]) {
    assert.throws(()=>mapSaleItem({...base(),dimension_metadata:broken}),undefined,JSON.stringify(broken));
  }
  assert.throws(()=>mapSaleItem({...base(),quantity:"2.999",dimension_metadata:metadata()}));
});
