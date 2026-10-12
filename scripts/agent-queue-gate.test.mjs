import test from "node:test";
import assert from "node:assert/strict";
import {decideAgentRun,describeAgentExecution} from "./agent-queue-gate.mjs";
const sha="0123456789abcdef0123456789abcdef01234567";
const repo="evertekitsolutions-del/minarvabiz";
const queue={schemaVersion:1,repository:repo,tasks:[
 {id:"HR-004C-REVIEW-LIFECYCLE",status:"in_progress",priority:1},
 {id:"HR-005-HOLIDAYS",status:"in_progress",priority:5},
 {id:"HR-004D-RECURRING",status:"blocked",priority:4}
]};
const args={queue,pulls:[],checkoutSha:sha,mainSha:sha,repo,ref:"refs/heads/main"};
test("one explicitly approved source task only",()=>assert.deepEqual(decideAgentRun(args),{eligible:true,reason:"source_only_ready",taskId:"HR-005-HOLIDAYS"}));
test("open PR wins over new coding",()=>assert.deepEqual(decideAgentRun({...args,pulls:[{state:"open",base:{ref:"main"},number:343}]}),{eligible:false,reason:"finish_open_pr_first",taskId:""}));
test("stale checkout cannot create duplicate development",()=>assert.equal(decideAgentRun({...args,mainSha:"abcdef0123456789abcdef0123456789abcdef01"}).reason,"stale_checkout"));
test("no source-approved task means no AI run",()=>assert.equal(decideAgentRun({...args,queue:{...queue,tasks:[queue.tasks[0]]}}).reason,"no_approved_source_task"));
test("wrong repository and non-main branch fail closed",()=>{
 assert.throws(()=>decideAgentRun({...args,repo:"attacker/minarvabiz"}));
 assert.throws(()=>decideAgentRun({...args,ref:"refs/heads/feature"}));
});
test("missing/truncated PR list and missing sha fail closed",()=>{
 assert.throws(()=>decideAgentRun({...args,pulls:null}));
 assert.throws(()=>decideAgentRun({...args,pulls:Array.from({length:100},()=>({state:"closed"}))}));
 assert.throws(()=>decideAgentRun({...args,checkoutSha:"bad"}));
});
test("blocked and verified tasks are never picked",()=>{
 assert.equal(decideAgentRun({...args,queue:{...queue,tasks:[{id:"HR-005-HOLIDAYS",status:"verified",priority:1}]}}).eligible,false);
 assert.equal(decideAgentRun({...args,queue:{...queue,tasks:[{id:"HR-005-HOLIDAYS",status:"blocked",priority:1}]}}).eligible,false);
});

test("a successful read-only preflight must NOT claim background coding", () => {
 const decision=decideAgentRun(args);
 const off=describeAgentExecution(decision, "");
 assert.equal(off.state,"DISABLED_NO_CODING");
 assert.equal(off.codeGenerated,false);
 assert.match(off.detail,/not true/);
 const on=describeAgentExecution(decision,"true");
 assert.equal(on.state,"REVIEW_PATCH_JOB_ELIGIBLE");
 assert.equal(on.codeGenerated,false,"eligibility is not generated code");
 const blocked=describeAgentExecution({eligible:false,reason:"finish_open_pr_first"},"true");
 assert.equal(blocked.state,"BLOCKED_NO_CODING");
});
