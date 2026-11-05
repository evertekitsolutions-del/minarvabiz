import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const { decideAccountingPeriodPosting: decide } = require("../accounting-period-lock.ts");
const period = { id:"p1", tenantId:"t", companyId:"c", branchId:null, startsOn:"2026-01-01", endsBefore:"2026-02-01", revision:3, status:"open" };
const request = { tenantId:"t", companyId:"c", branchId:"b", postingDate:"2026-01-31", expectedRevision:3 };
test("allows authorized candidate at inclusive start and exclusive end", () => {
  assert.deepEqual(decide(request,[period]), { allowed:true, matchedPeriodId:"p1", revision:3 });
  assert.equal(decide({...request, postingDate:"2026-02-01"},[period]).reason,"uncovered_date");
});
test("rejects closed period and stale revisions", () => {
  assert.equal(decide(request,[{...period,status:"closed"}]).reason,"closed_period");
  assert.equal(decide({...request,expectedRevision:2},[period]).reason,"stale_revision");
});
test("fails closed on cross-tenant and branch scope", () => {
  assert.equal(decide(request,[{...period,tenantId:"other"}]).reason,"invalid_periods");
  assert.equal(decide(request,[{...period,branchId:"other"}]).reason,"invalid_periods");
});
test("rejects overlapping windows and duplicate period IDs", () => {
  assert.equal(decide(request,[period,{...period,id:"p2",startsOn:"2026-01-15"}]).reason,"invalid_periods");
  assert.equal(decide(request,[period,period]).reason,"invalid_periods");
});
test("rejects impossible dates, invalid intervals and missing snapshot", () => {
  assert.equal(decide({...request,postingDate:"2026-02-30"},[period]).reason,"invalid_date");
  assert.equal(decide(request,[{...period,endsBefore:"2026-01-01"}]).reason,"invalid_periods");
  assert.equal(decide(request,[]).reason,"uncovered_date");
});
