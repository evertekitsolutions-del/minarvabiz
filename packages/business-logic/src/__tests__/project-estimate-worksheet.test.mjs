import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, file);
const { calculateProjectEstimate } = require("../project-estimate-worksheet.ts");
const scope = { tenantId:"t", companyId:"c", branchId:"b", projectId:"p", canViewCosts:true };
const base = { ...scope, currency:"INR", revision:0, lines:[
  { id:"labor", description:"Technician", kind:"labor", quantity:"2.500", unitCost:"100.00", markupPercent:"20.00" },
  { id:"parts", description:"Parts", kind:"material", quantity:"1", unitCost:"10.01", markupPercent:"0" }
]};
const run = (patch = {}, auth = scope) => calculateProjectEstimate({ ...base, ...patch }, auth);
test("exact fixed-point calculations with fractional quantities", () => {
  const result=run();
  assert.equal(result.costMinor,26001);
  assert.equal(result.proposedRevenueMinor,31001);
  assert.equal(result.grossMarginMinor,5000);
  assert.deepEqual(result.lines.map(x=>x.costMinor),[25000,1001]);
  assert.equal(result.revision,0);
});
test("fail closed on permission and cross-scope access", () => {
  assert.throws(()=>run({}, {...scope,canViewCosts:false}),/permission/);
  for(const key of ["tenantId","companyId","branchId","projectId"]) {
    assert.throws(()=>run({[key]:"other"}),/scope mismatch/);
  }
});
test("reject duplicate IDs, malformed inputs and unsupported currencies", () => {
  assert.throws(()=>run({lines:[base.lines[0],base.lines[0]]}),/Duplicate/);
  assert.throws(()=>run({currency:"inr"}),/currency/);
  assert.throws(()=>run({revision:0.5}),/revision/);
  assert.throws(()=>run({lines:[]}),/1–500/);
  assert.throws(()=>run({lines:[{...base.lines[0],quantity:"0"}]}),/quantity/);
  assert.throws(()=>run({lines:[{...base.lines[0],unitCost:"1.001"}]}),/precision/);
  assert.throws(()=>run({lines:[{...base.lines[0],markupPercent:"1000.01"}]}),/range/);
  assert.throws(()=>run({lines:[{...base.lines[0],description:""}]}),/description/);
});
test("rounded line totals are deterministic and input is untouched",()=>{
  const original=JSON.stringify(base);
  const result=run({lines:[{...base.lines[0],quantity:"0.001",unitCost:"5.00",markupPercent:"0"}]});
  assert.equal(result.costMinor,1);
  assert.equal(result.proposedRevenueMinor,1);
  assert.equal(JSON.stringify(base),original);
  assert.equal(Object.isFrozen(result),true);
});
test("overflow cannot silently change money",()=>{
  const line={...base.lines[0],quantity:"999999.999",unitCost:"9999999999.99",markupPercent:"999.99"};
  assert.throws(()=>run({lines:[line]}),/overflow/);
});
