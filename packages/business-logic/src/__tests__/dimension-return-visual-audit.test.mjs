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

test("return screen must show original immutable area before entering partial refund quantity",()=>{
  const ui=fs.readFileSync(
    new URL("../../../ui/src/components/returns/ReturnsPanel.tsx",import.meta.url),"utf8"
  );
  assert.match(ui,/formatReturnDimensionEvidence\(item\)/);
  assert.match(ui,/Recorded area/);
  const {formatReturnDimensionEvidence}=require(
    "../../../ui/src/components/returns/return-dimension-evidence.ts"
  );
  const base={id:"line-1",quantity:3};
  const packet={
    schema:"dimension-line-v1",algorithm:"area-v1",length:"12",width:"18",
    lengthUnit:"in",widthUnit:"in",billableUnit:"sqft",pieces:2,quantityMilli:3000,
  };
  assert.equal(formatReturnDimensionEvidence(base),null);
  assert.equal(formatReturnDimensionEvidence({...base,dimensionMetadata:null}),null);
  const valid=formatReturnDimensionEvidence({...base,dimensionMetadata:packet});
  assert.deepEqual(valid,{
    status:"valid",label:"Recorded area: 12 in × 18 in × 2 pcs = 3 sqft",
  });
  for(const bad of [
    {...packet,length:"13"},
    {...packet,quantityMilli:2999},
    {...packet,algorithm:"area-v2"},
    {...packet,extra:"unauthorized"},
  ]){
    const result=formatReturnDimensionEvidence({...base,dimensionMetadata:bad});
    assert.deepEqual(result,{
      status:"invalid",label:"Invalid recorded area — refund blocked",
    });
  }
  assert.equal(
    formatReturnDimensionEvidence({...base,quantity:3.0004,dimensionMetadata:packet}).status,
    "invalid"
  );
});
