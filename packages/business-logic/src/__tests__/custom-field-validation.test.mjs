import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{
  fileName:filename, compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,filename);
const {validateCustomFieldValues: validate} = require("../custom-field-validation.ts");
const schema = [
 {key:"serial_no",kind:"text",required:true,maxLength:20},
 {key:"weight",kind:"number"},
 {key:"fragile",kind:"boolean"},
 {key:"received_on",kind:"date"},
 {key:"priority",kind:"choice",choices:["normal","urgent"]},
];
test("neutral cross-industry values are validated without mutation",()=>{
 const values={serial_no:"A-123",weight:2.5,fragile:false,received_on:"2026-11-06",priority:"urgent"};
 const before=JSON.stringify(values);
 assert.deepEqual({...validate(schema,values)},values);
 assert.equal(JSON.stringify(values),before);
});
test("unknown, missing, invalid and dangerous values fail closed",()=>{
 for(const values of [{},{serial_no:"ok",foreign:"secret"},{serial_no:"ok",weight:Infinity},
 {serial_no:"ok",fragile:"false"},{serial_no:"ok",received_on:"2026-02-30"},
 {serial_no:"ok",priority:"admin"},{serial_no:"x".repeat(21)}]){
   assert.throws(()=>validate(schema,values));
 }
 assert.throws(()=>validate(schema,JSON.parse('{"serial_no":"ok","__proto__":"bad"}')));
 assert.throws(()=>validate(schema,null));
});
test("malformed definitions cannot be used to bypass schema",()=>{
 for(const definitions of [
 [{key:"x",kind:"text"},{key:"x",kind:"text"}],
 [{key:"constructor",kind:"text"}],
 [{key:"x",kind:"choice",choices:["a","a"]}],
 [{key:"x",kind:"text",maxLength:-1}],
 [{key:"x",kind:"object"}],
 ]) assert.throws(()=>validate(definitions,{}));
});
test("optional null and empty are normalized; required empty rejected",()=>{
 assert.deepEqual({...validate([{key:"note",kind:"text"}],{note:""})},{note:null});
 assert.throws(()=>validate(schema,{serial_no:""}));
});
