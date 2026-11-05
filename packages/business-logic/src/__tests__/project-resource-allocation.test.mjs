import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(
  fs.readFileSync(file, "utf8"),
  {fileName:file, compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}},
).outputText, file);
const {planProjectResourceAllocation} = require("../project-resource-allocation.ts");
const booking = {
  id:"a1",tenantId:"t1",companyId:"c1",branchId:"b1",projectId:"p1",resourceId:"staff1",
  startAt:"2026-11-06T08:00:00Z",endAt:"2026-11-06T12:00:00Z",
  capacityPercent:60,status:"confirmed",
};
const request = {booking,actorId:"manager1",authorized:true,expectedResourceRevision:4};
const row = (patch={})=>({...booking,id:"other",capacityPercent:40,...patch});
const plan=(patch={},rows=[],revision=4)=>planProjectResourceAllocation(
  {...request,...patch},rows,revision,
);
test("confirms a scoped booking with immutable audit and revision CAS envelope",()=>{
  const original=JSON.stringify(booking);
  const result=plan({},[row()]);
  assert.equal(result.nextResourceRevision,5);
  assert.equal(result.audit.action,"resource_booking_confirmed");
  assert.equal(result.audit.projectId,"p1");
  assert.equal(JSON.stringify(booking),original);
});
test("rejects over-allocation including three-way overlap",()=>{
  assert.throws(()=>plan({},[row({capacityPercent:41})]),/capacity exceeded/);
  assert.throws(()=>plan({},[
    row({capacityPercent:25}),
    row({id:"other2",capacityPercent:20,startAt:"2026-11-06T10:00:00Z"}),
  ]),/capacity exceeded/);
});
test("allows half-open adjacent windows, cancelled bookings and nonoverlap",()=>{
  assert.doesNotThrow(()=>plan({},[
    row({capacityPercent:100,endAt:"2026-11-06T08:00:00Z",startAt:"2026-11-06T07:00:00Z"}),
    row({id:"after",capacityPercent:100,startAt:"2026-11-06T12:00:00Z",endAt:"2026-11-06T13:00:00Z"}),
    row({id:"cancel",capacityPercent:100,status:"cancelled"}),
  ]));
});
test("prevents unauthorized, stale and cross-company/tenant snapshots",()=>{
  assert.throws(()=>plan({authorized:false}),/authorized/);
  assert.throws(()=>plan({expectedResourceRevision:3}),/Stale/);
  assert.throws(()=>plan({},[],5),/Stale/);
  assert.throws(()=>plan({},[row({tenantId:"other"})]),/scope/);
  assert.throws(()=>plan({},[row({companyId:"other"})]),/scope/);
  assert.throws(()=>plan({},[row({resourceId:"other"})]),/scope/);
  assert.doesNotThrow(()=>plan({},[row({branchId:"b2"})]));
});
test("rejects duplicate IDs, invalid windows, capacity and timestamp",()=>{
  assert.throws(()=>plan({},[row({id:"a1"})]),/Duplicate/);
  assert.throws(()=>plan({},[row(),row()]),/Duplicate/);
  assert.throws(()=>plan({booking:{...booking,capacityPercent:101}}),/capacity percentage/);
  assert.throws(()=>plan({booking:{...booking,capacityPercent:1.5}}),/capacity percentage/);
  assert.throws(()=>plan({booking:{...booking,startAt:booking.endAt}}),/positive duration/);
  assert.throws(()=>plan({booking:{...booking,startAt:"2026-02-30T08:00:00Z"}}),/timestamp/);
  assert.throws(()=>plan({booking:{...booking,status:"cancelled"}}),/Only confirmed/);
  assert.throws(()=>plan({},[],Number.MAX_SAFE_INTEGER),/Stale/);
  assert.throws(()=>plan({expectedResourceRevision:Number.MAX_SAFE_INTEGER},[],Number.MAX_SAFE_INTEGER),/overflow/);
});
