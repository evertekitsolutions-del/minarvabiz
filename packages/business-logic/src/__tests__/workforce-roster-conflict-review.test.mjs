import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module,filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename,"utf8"),{
    compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true },
  }).outputText,filename,
);
const permissions=require("../permissions.ts");
const phase=require("../phase6-store.ts");
const writer=require("../remote-write.ts");
const outbox=require("../outbox-bridge.ts");
permissions.setCurrentRole("admin");
phase.hydratePhase6({shiftRules:[],rosterSlots:[]});
const shift=phase.createShiftRule({name:"Review-only shift",startTime:"09:00",endTime:"17:00",
  unpaidBreakMinutes:30,branchId:null,active:true});
const events=()=>outbox.exportOutbox().filter(e=>
  (e.aggregateType==="staff_shift_rules"||e.aggregateType==="staff_roster_slots")&&
  (e.status==="pending"||e.status==="failed"));
const ev=events().at(-1);
assert.equal(ev.aggregateId,shift.id);
const remoteShift={...shift,name:"Cloud shift version",version:3};
writer.registerRemoteWriter({getRosterShift:async id=>{
  assert.equal(id,shift.id);return remoteShift;
}});
const before=structuredClone(events());
const review=await phase.reviewWorkforceRosterConflict(ev.id);
assert.equal(review.eventId,ev.id);
assert.equal(review.aggregateType,"staff_shift_rules");
assert.equal(review.local.name,"Review-only shift");
assert.equal(review.local.version,1);
assert.equal(review.remote.name,"Cloud shift version");
assert.equal(review.remote.version,3);
assert.deepEqual(events(),before,"Read-only review does not discard/rebase/confirm queued events");
assert.equal(phase.listShiftRules(true).at(-1).name,shift.name,
  "Conflict preview cannot overwrite the local shift");

// Missing remote row is an unconfirmed creation, not a reason to auto-delete.
writer.registerRemoteWriter({getRosterShift:async()=>null});
const uncommitted=await phase.reviewWorkforceRosterConflict(ev.id);
assert.equal(uncommitted.remote,null);
assert.equal(events().at(-1).status,"pending");
await assert.rejects(()=>phase.reviewWorkforceRosterConflict("not-an-event"),/No unconfirmed/);
writer.registerRemoteWriter(null);
await assert.rejects(()=>phase.reviewWorkforceRosterConflict(ev.id),/reader is unavailable/);

const roster=phase.assignRosterSlot({staffId:"staff-1",workDate:"2026-10-12",
  shiftRuleId:shift.id,branchId:null,status:"scheduled"});
const slotEvent=events().find(e=>e.aggregateId===roster.id);
writer.registerRemoteWriter({getRosterSlot:async id=>({...roster,id,version:7,status:"cancelled"})});
const slotReview=await phase.reviewWorkforceRosterConflict(slotEvent.id);
assert.equal(slotReview.remote.version,7);
assert.equal(slotReview.local.status,"scheduled");

// If identity changes during a cloud read, no stale result may appear in the new session.
let startRead,completeRead;
const started=new Promise(resolve=>{startRead=resolve;});
const pending=new Promise(resolve=>{completeRead=resolve;});
writer.registerRemoteWriter({getRosterShift:async()=>{startRead();await pending;return remoteShift;}});
const inFlight=phase.reviewWorkforceRosterConflict(ev.id);
await started;
writer.registerRemoteWriter(null);
completeRead();
await assert.rejects(inFlight,/session changed while reviewing/);
assert.deepEqual(events(),[...events()],"Revocation cannot silently acknowledge queue");
permissions.setCurrentRole("cashier");
assert.rejects(()=>phase.reviewWorkforceRosterConflict(ev.id),/Permission denied: staff.manage/);
writer.registerRemoteWriter(null);
console.log("HR-004 conflict review: RLS writer, immutable event, missing row, session revocation and RBAC PASS");
