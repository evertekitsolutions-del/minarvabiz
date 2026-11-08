import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,file);
const {transitionProjectMilestone}=require("../project-milestone-transitions.ts");
const milestone={id:"m1",tenantId:"t1",companyId:"c1",branchId:"b1",projectId:"p1",
  title:"Site acceptance",dueDate:"2026-11-10",status:"planned",revision:2,
  updatedAt:"2026-11-05T10:00:00Z",completedAt:null};
const action={tenantId:"t1",companyId:"c1",branchId:"b1",projectId:"p1",
  milestoneId:"m1",expectedRevision:2,nextStatus:"in_progress",actorId:"staff1",
  occurredAt:"2026-11-06T10:00:00Z",authorized:true};
test("planned to in-progress produces immutable scoped audit and incremented revision",()=>{
  const before=JSON.stringify(milestone);
  const result=transitionProjectMilestone(milestone,action);
  assert.equal(result.milestone.revision,3);
  assert.equal(result.audit.from,"planned");
  assert.equal(result.audit.to,"in_progress");
  assert.equal(result.audit.actorId,"staff1");
  assert.equal(JSON.stringify(milestone),before);
});
test("completion records timestamp, terminal states cannot reopen",()=>{
  const started=transitionProjectMilestone(milestone,action).milestone;
  const done=transitionProjectMilestone(started,{...action,expectedRevision:3,nextStatus:"completed"}).milestone;
  assert.equal(done.completedAt,action.occurredAt);
  assert.throws(()=>transitionProjectMilestone(done,{...action,expectedRevision:4}),/Invalid milestone status/);
});
test("fail closed for unauthorized, cross-tenant, cross-branch, cross-project and stale writes",()=>{
  for(const patch of [{authorized:false},{tenantId:"t2"},{companyId:"c2"},
    {branchId:"b2"},{projectId:"p2"},{milestoneId:"m2"},{expectedRevision:1}]){
    assert.throws(()=>transitionProjectMilestone(milestone,{...action,...patch}));
  }
});
test("cancel requires reason; blocked workflow must resume before completion",()=>{
  assert.throws(()=>transitionProjectMilestone(milestone,{...action,nextStatus:"cancelled"}),/reason/);
  const cancelled=transitionProjectMilestone(milestone,{...action,nextStatus:"cancelled",reason:"Client withdrew"}).milestone;
  assert.equal(cancelled.status,"cancelled");
  const started=transitionProjectMilestone(milestone,action).milestone;
  const blocked=transitionProjectMilestone(started,{...action,expectedRevision:3,nextStatus:"blocked"}).milestone;
  assert.throws(()=>transitionProjectMilestone(blocked,{...action,expectedRevision:4,nextStatus:"completed"}),/Invalid/);
});
test("reject stale clocks, invalid timestamps and overflow",()=>{
  assert.throws(()=>transitionProjectMilestone(milestone,{...action,occurredAt:"2026-11-01T10:00:00Z"}),/timestamp/);
  assert.throws(()=>transitionProjectMilestone(milestone,{...action,occurredAt:"not-a-date"}),/timestamp/);
  assert.throws(()=>transitionProjectMilestone({...milestone,revision:Number.MAX_SAFE_INTEGER},
    {...action,expectedRevision:Number.MAX_SAFE_INTEGER}),/overflow/);
});
