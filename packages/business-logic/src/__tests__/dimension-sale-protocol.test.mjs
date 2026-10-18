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
const {
  requireDimensionSaleCapability,
  requireDimensionSaleReceipt,
}=require("../dimension-sale-protocol.ts");

test("read-only capability attests exact dimensional protocol version",()=>{
  assert.doesNotThrow(()=>requireDimensionSaleCapability({
    protocol:"dimension-sale-v1",schemaVersion:1,
  }));
  for(const invalid of [
    undefined,null,{},[],false,"dimension-sale-v1",
    {protocol:"dimension-sale-v0",schemaVersion:1},
    {protocol:"dimension-sale-v1",schemaVersion:0},
    {protocol:"dimension-sale-v1",schemaVersion:"1"},
    {protocol:"dimension-sale-v1",schemaVersion:1,extra:true},
  ]) assert.throws(()=>requireDimensionSaleCapability(invalid));
});

test("atomic sale response binds to one exact receipt; never acknowledge anonymous or mismatched response",()=>{
  assert.doesNotThrow(()=>requireDimensionSaleReceipt(
    {sale_id:"sale-id-1",idempotent:false},"sale-id-1"
  ));
  assert.doesNotThrow(()=>requireDimensionSaleReceipt(
    {sale_id:"sale-id-1",idempotent:true},"sale-id-1"
  ));
  for(const invalid of [
    undefined,null,{},[],false,
    {sale_id:"other-sale",idempotent:false},
    {sale_id:"sale-id-1"},
    {sale_id:"sale-id-1",idempotent:"true"},
    {sale_id:"sale-id-1",idempotent:false,protocol:"unknown"},
  ]) assert.throws(()=>requireDimensionSaleReceipt(invalid,"sale-id-1"));
});
