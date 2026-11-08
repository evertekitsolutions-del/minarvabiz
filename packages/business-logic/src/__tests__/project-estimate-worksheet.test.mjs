import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, file);
const { calculateProjectEstimate, saveProjectEstimate, exportProjectEstimateCsv, loadProjectEstimate, saveProjectEstimateWithRetry } = require("../project-estimate-worksheet.ts");
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
  assert.throws(()=>run({lines:[{...base.lines[0],markupPercent:"1000.01"}]}),/precision|range/);
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

test("save contract sends atomic audit and optimistic revision without posting", async () => {
  let captured;
  const writeScope = { ...scope, canEditEstimates:true, actorId:"manager" };
  const saved = await saveProjectEstimate(base, writeScope, "request-001", {
    async saveAtomically(command) { captured = command; return "saved"; }
  });
  assert.equal(saved.status, "saved");
  assert.equal(captured.expectedRevision, 0);
  assert.equal(captured.nextRevision, 1);
  assert.equal(captured.audit.actorId, "manager");
  assert.equal(captured.audit.action, "project.estimate.saved");
  assert.equal(captured.totals.costMinor, 26001);
  assert.equal(captured.scope.tenantId, "t");
  assert.notEqual(captured.worksheet.lines[0], base.lines[0]);
});
test("save rejects unauthorized edits, conflicts and missing storage acknowledgement", async () => {
  const store = { async saveAtomically() { return "conflict"; } };
  await assert.rejects(saveProjectEstimate(base, {...scope,canEditEstimates:false,actorId:"a"}, "key", store), /edit permission/);
  await assert.rejects(saveProjectEstimate(base, {...scope,canEditEstimates:true,actorId:"a"}, "key", store), /revision conflict/);
  await assert.rejects(saveProjectEstimate(base, {...scope,canEditEstimates:true,actorId:"a"}, "key", {async saveAtomically(){return undefined;}}), /acknowledgement/);
  const replay = await saveProjectEstimate(base, {...scope,canEditEstimates:true,actorId:"a"}, "key", {async saveAtomically(){return "replayed";}});
  assert.equal(replay.status, "replayed");
});

test("CSV export includes exact totals, CRLF, BOM and spreadsheet formula protection", () => {
  const injected = { ...base, lines: [
    { ...base.lines[0], id: "=HYPERLINK(\"https://example.test\")", description: "  +SUM(1,1)" },
    { ...base.lines[1], description: "Quoted \"value\", line" },
  ] };
  const csv = exportProjectEstimateCsv(injected, scope);
  assert.ok(csv.charCodeAt(0) === 0xFEFF);
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /"'  \+SUM/);
  assert.match(csv, /"Quoted ""value"", line"/);
  assert.match(csv, /"TOTAL".*"26001","31001","INR"/);
  assert.ok(csv.endsWith("\r\n"));
  assert.throws(() => exportProjectEstimateCsv(injected, { ...scope, canViewCosts:false }), /permission/);
});

test("scoped read recomputes persisted estimate totals and returns immutable snapshot", async () => {
  let captured;
  const loaded = await loadProjectEstimate(scope, { async loadScoped(ids) {
    captured = ids;
    return { ...base, lines: base.lines.map(line => ({...line})), costMinor: 0 };
  } });
  assert.deepEqual(captured, { tenantId:"t", companyId:"c", branchId:"b", projectId:"p", canViewCosts:true });
  assert.equal(loaded.totals.costMinor, 26001);
  assert.equal(Object.isFrozen(loaded.worksheet.lines[0]), true);
  assert.equal(Object.isFrozen(loaded.worksheet.lines), true);
  assert.equal(loaded.worksheet.revision, 0);
});
test("scoped read fails closed on unauthorized, cross-tenant and corrupt storage", async () => {
  let calls = 0;
  const reader = { async loadScoped() { calls++; return base; } };
  await assert.rejects(loadProjectEstimate({...scope,canViewCosts:false}, reader), /permission/);
  assert.equal(calls, 0);
  await assert.rejects(loadProjectEstimate(scope, {async loadScoped(){return {...base,tenantId:"other"};}}), /scope mismatch/);
  await assert.rejects(loadProjectEstimate(scope, {async loadScoped(){return {...base,lines:[]};}}), /1–500/);
  assert.equal(await loadProjectEstimate(scope, {async loadScoped(){return null;}}), null);
});

test("transient estimate write retries preserve idempotency and revision", async () => {
  const commands = [];
  const auth = {...scope,canEditEstimates:true,actorId:"manager"};
  const result = await saveProjectEstimateWithRetry(base, auth, "stable-key", {
    async saveAtomically(command) {
      commands.push(command);
      if (commands.length === 1) throw Object.assign(new Error("timeout"), {code:"ETIMEDOUT"});
      return "replayed";
    }
  }, {maxAttempts:3,isTransient:e=>e?.code==="ETIMEDOUT"});
  assert.equal(result.status,"replayed");
  assert.equal(commands.length,2);
  assert.equal(commands[0].idempotencyKey,commands[1].idempotencyKey);
  assert.equal(commands[0].expectedRevision,commands[1].expectedRevision);
  assert.deepEqual(commands[0].worksheet,commands[1].worksheet);
});
test("estimate retries fail closed for conflicts, permanent failures and exhausted attempts", async () => {
  const auth = {...scope,canEditEstimates:true,actorId:"manager"};
  let calls=0;
  const transient={async saveAtomically(){calls++;throw Object.assign(new Error("timeout"),{code:"ETIMEDOUT"});}};
  await assert.rejects(saveProjectEstimateWithRetry(base,auth,"key",transient,
    {maxAttempts:2,isTransient:e=>e?.code==="ETIMEDOUT"}),/timeout/);
  assert.equal(calls,2);
  calls=0;
  await assert.rejects(saveProjectEstimateWithRetry(base,auth,"key",
    {async saveAtomically(){calls++;return "conflict";}},
    {maxAttempts:3,isTransient:()=>false}),/revision conflict/);
  assert.equal(calls,1);
  await assert.rejects(saveProjectEstimateWithRetry(base,auth,"key",transient,
    {maxAttempts:0,isTransient:()=>true}),/retry limit/);
});
