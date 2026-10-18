import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,filename)=>mod._compile(
  ts.transpileModule(fs.readFileSync(filename,"utf8"),{
    fileName:filename,
    compilerOptions:{
      module:ts.ModuleKind.CommonJS,
      target:ts.ScriptTarget.ES2022,
      esModuleInterop:true,
      inlineSourceMap:true,
      inlineSources:true,
    },
  }).outputText,filename
);
const {serializeDimensionSaleLine}=require("../dimension-sale-wire.ts");
const metadata=Object.freeze({
  schema:"dimension-line-v1",algorithm:"area-v1",
  length:"12",width:"18",lengthUnit:"in",widthUnit:"in",
  billableUnit:"sqft",pieces:2,quantityMilli:3000,
});

test("supported dimension is canonical and serialized to snake_case cloud RPC",()=>{
  const wire=serializeDimensionSaleLine({quantity:3,dimensionMetadata:metadata});
  assert.deepEqual(wire,{dimension_metadata:metadata});
  assert.notEqual(wire.dimension_metadata,metadata);
  assert.ok(Object.isFrozen(wire));
  assert.ok(Object.isFrozen(wire.dimension_metadata));
  assert.deepEqual(JSON.parse(JSON.stringify(wire)).dimension_metadata,metadata);
});

test("legacy non-dimensional lines contribute no additional wire fields",()=>{
  assert.deepEqual(serializeDimensionSaleLine({quantity:2}),{});
  assert.deepEqual(serializeDimensionSaleLine({quantity:2,dimensionMetadata:null}),{});
});

test("refuse malformed, stale, ambiguous, or silently rounded audit input",()=>{
  for(const item of [
    {quantity:2.999,dimensionMetadata:metadata},
    {quantity:3.0004,dimensionMetadata:metadata},
    {quantity:3,dimensionMetadata:{...metadata,length:"13"}},
    {quantity:3,dimensionMetadata:{...metadata,quantityMilli:3001}},
    {quantity:3,dimensionMetadata:{...metadata,algorithm:"area-v2"}},
    {quantity:3,dimensionMetadata:{...metadata,pieces:3}},
    {quantity:3,dimensionMetadata:{...metadata,unexpected:true}},
    {quantity:3,dimensionMetadata:metadata,dimension_metadata:metadata},
    {quantity:3,dimensionMetadata:undefined,dimension_metadata:metadata},
    {quantity:Infinity,dimensionMetadata:metadata},
    {quantity:NaN,dimensionMetadata:metadata},
  ]) {
    assert.throws(()=>serializeDimensionSaleLine(item),undefined,JSON.stringify(item));
  }
});

test("dimension metadata is derived from the current values, not mutable cart aliases",()=>{
  const mutable={...metadata};
  const snapshot=serializeDimensionSaleLine({quantity:3,dimensionMetadata:mutable});
  mutable.length="25";
  assert.equal(snapshot.dimension_metadata.length,"12");
});
