import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const { validateMoneyAmountInput }=require("../service-order-price-draft.ts");
const app=fs.readFileSync(new URL("../../../../apps/desktop/src/App.tsx",import.meta.url),"utf8");
const match=app.match(/function parseDesktopSupplierOpeningAmount\(raw: string\): number \{([\s\S]*?)\n\}/);
assert.ok(match,"real desktop validator must exist");
const parse=new Function("validateMoneyAmountInput","raw",match[1]+"\nreturn undefined;").bind(null,validateMoneyAmountInput);
const submitted=app.match(/function handleCreateSupplier\(\)\{([\s\S]*?)\n  function handleSaveProduct/);
assert.ok(submitted,"real supplier form handler remains present");
assert.match(submitted[1],/parseDesktopSupplierOpeningAmount\(supplierForm\.openingBalance\)/);
assert.doesNotMatch(submitted[1],/Number\(supplierForm\.openingBalance\)\|\|0/);
test("invalid opening payable cannot turn into zero",()=>{
  for(const raw of ["NaN","Infinity","-1","1.234","1e2","hello","1 0","9999999999999999999"]){
    assert.throws(()=>parse(raw),/opening payable/,raw);
  }
});
test("valid opening payable remains exact without coercion",()=>{
  for(const [raw,value] of [["0",0],["0.01",0.01],["42.50",42.5],[" .30 ",.3]]){
    assert.equal(parse(raw),value);
  }
});
test("blank is explicit zero only at create form call site",()=>{
  assert.match(submitted[1],/supplierForm\.openingBalance\.trim\(\) \? parseDesktopSupplierOpeningAmount/);
});
