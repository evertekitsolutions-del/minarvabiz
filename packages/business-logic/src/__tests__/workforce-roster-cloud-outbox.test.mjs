import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename,"utf8"),{
    compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true },
  }).outputText,filename,
);
const permissions=require("../permissions.ts");
const phase=require("../phase6-store.ts");
const remote=require("../remote-write.ts");
const outbox=require("../outbox-bridge.ts");
permissions.setCurrentRole("admin");
phase.hydratePhase6({shiftRules:[],rosterSlots:[]});
const day=phase.createShiftRule({name:"Domain drain test",startTime:"09:00",endTime:"17:00",unpaidBreakMinutes:30,branchId:null,active:true});
const slot=phase.assignRosterSlot({staffId:"staff-1",workDate:"2026-10-09",shiftRuleId:day.id,branchId:null,status:"scheduled"});
const rosterEvents=()=>outbox.exportOutbox().filter(e=>
  e.aggregateType==="staff_shift_rules"||e.aggregateType==="staff_roster_slots");
assert.equal(rosterEvents().length,2);
assert.equal(rosterEvents()[0].payload.version,1);
const calls=[];
let refuseSlots=true;
remote.registerRemoteWriter({upsertRosterEvent:async event=>{
  calls.push(event.id);
  if(refuseSlots && event.aggregateType==="staff_roster_slots")throw new Error("simulated authorized RPC rejection");
}});
await assert.rejects(()=>phase.flushWorkforceRosterOutbox(),/simulated authorized RPC rejection/);
assert.equal(rosterEvents()[0].status,"synced","Only acknowledged shift was confirmed");
assert.equal(rosterEvents()[1].status,"failed","Rejected roster remains recoverable");
assert.equal(rosterEvents()[1].attempts,1);
assert.match(rosterEvents()[1].lastError,/RPC rejection/);
refuseSlots=false;
assert.equal(await phase.flushWorkforceRosterOutbox(),1,"Explicit retry acknowledges only failed record");
assert.equal(rosterEvents()[1].status,"synced");
assert.equal(await phase.flushWorkforceRosterOutbox(),0,"Retry is idempotent when already confirmed");
assert.deepEqual(calls,[rosterEvents()[0].id,rosterEvents()[1].id,rosterEvents()[1].id]);
const another=phase.createShiftRule({name:"Blocked subsequent event",startTime:"18:00",endTime:"23:00",unpaidBreakMinutes:0,branchId:null,active:true});
phase.assignRosterSlot({staffId:"staff-1",workDate:"2026-10-10",shiftRuleId:another.id,branchId:null,status:"scheduled"});
const newEvents=rosterEvents().filter(e=>e.status==="pending");
assert.equal(newEvents.length,2);
let attemptCount=0;
remote.registerRemoteWriter({upsertRosterEvent:async()=>{
  attemptCount++;
  throw new Error("first revision denied");
}});
await assert.rejects(()=>phase.flushWorkforceRosterOutbox(),/first revision denied/);
assert.equal(attemptCount,1,"Dependent event cannot skip a failed earlier shift");
assert.equal(newEvents[0].status,"failed");
assert.equal(newEvents[1].status,"pending");
remote.registerRemoteWriter(null);
await assert.rejects(()=>phase.flushWorkforceRosterOutbox(),/RPC writer is unavailable/);
assert.equal(newEvents[1].status,"pending","Missing auth does not silently acknowledge queued writes");
permissions.setCurrentRole("cashier");
assert.throws(()=>phase.flushWorkforceRosterOutbox(),/Permission denied: staff.manage/);

/** Revoking the user session during an in-flight write must fail closed. */
permissions.setCurrentRole("admin");
// Drain previously failed regression fixtures with an explicit authorized retry.
remote.registerRemoteWriter({upsertRosterEvent:async()=>{}});
assert.equal(await phase.flushWorkforceRosterOutbox(),2);
remote.registerRemoteWriter(null);
const rotating=phase.createShiftRule({name:"Stale response must not confirm",startTime:"06:00",endTime:"09:00",unpaidBreakMinutes:0,branchId:null,active:true});
phase.assignRosterSlot({staffId:"staff-1",workDate:"2026-10-11",shiftRuleId:rotating.id,branchId:null,status:"scheduled"});
const revocationEvents=rosterEvents().filter(e=>e.status==="pending");
assert.equal(revocationEvents.length,2);
let completeRpc;
let startedRpc;
const started=new Promise(resolve=>{startedRpc=resolve;});
const inflight=new Promise(resolve=>{completeRpc=resolve;});
let sends=0;
remote.registerRemoteWriter({upsertRosterEvent:async()=>{
  sends++;
  startedRpc();
  await inflight;
}});
const draining=phase.flushWorkforceRosterOutbox();
await started;
remote.registerRemoteWriter(null);
completeRpc();
await assert.rejects(draining,/Workforce session changed during sync/);
assert.equal(sends,1,"Do not submit dependent revision after credential revocation");
assert.equal(revocationEvents[0].status,"failed","In-flight acknowledgement is retained as uncertain");
assert.equal(revocationEvents[1].status,"pending","Subsequent changes remain queued");
assert.equal(revocationEvents[0].attempts,1);
assert.match(revocationEvents[0].lastError,/session changed/);
// Fresh login must explicitly retry the original idempotent event IDs.
let replays=[];
remote.registerRemoteWriter({upsertRosterEvent:async event=>{replays.push(event.id);}});
assert.equal(await phase.flushWorkforceRosterOutbox(),2);
assert.deepEqual(replays,revocationEvents.map(event=>event.id));
assert.ok(revocationEvents.every(event=>event.status==="synced"));
remote.registerRemoteWriter(null);

console.log("HR roster ordered outbox: atomic acknowledgement, explicit retry, stop-on-error, no writer and RBAC PASS");
