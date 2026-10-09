import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText,f);
const permissions=require("../permissions.ts");
const phase=require("../phase6-store.ts");
const writer=require("../remote-write.ts");
const outbox=require("../outbox-bridge.ts");
permissions.setCurrentRole("admin");
phase.hydratePhase6({shiftRules:[],rosterSlots:[]});
const pending=()=>outbox.exportOutbox().filter(e=>
  (e.aggregateType==="staff_shift_rules"||e.aggregateType==="staff_roster_slots")&&
  (e.status==="pending"||e.status==="failed"));
const shift=phase.createShiftRule({name:"Local",startTime:"08:00",endTime:"16:00",
  unpaidBreakMinutes:30,active:true,branchId:null});
const event=pending().at(-1);
const original=structuredClone(event);
let remote={...shift,name:"Cloud",version:4};
writer.registerRemoteWriter({getRosterShift:async()=>remote});
const first=await phase.reviewWorkforceRosterConflict(event.id);
await phase.keepCloudWorkforceRosterConflict(first);
assert.equal(pending().length,0);
assert.equal(phase.listShiftRules(true).find(s=>s.id===shift.id).name,"Cloud");
assert.equal(phase.listShiftRules(true).find(s=>s.id===shift.id).version,4);
assert.deepEqual(event.payload,original.payload,"Original immutable event payload survives");
assert.equal(event.status,"discarded","The reviewed event is never acknowledged as synced");
assert.equal(event.sequence,original.sequence);
assert.equal(event.id,original.id);

const next=phase.updateShiftRule(shift.id,{name:"Offline correction"});
const nextEvent=pending()[0];
assert.equal(next.version,5);
remote={...shift,name:"Cloud changed",version:8};
const staleReview=await phase.reviewWorkforceRosterConflict(nextEvent.id);
remote={...remote,name:"Changed again",version:9};
await assert.rejects(()=>phase.keepCloudWorkforceRosterConflict(staleReview),
  /revision changed; review again/);
assert.equal(nextEvent.status,"pending","Stale Cloud snapshot cannot discard event");
assert.equal(phase.listShiftRules(true).find(s=>s.id===shift.id).name,"Offline correction");

// A failed RPC and a second pending dependent correction must be reviewed in order.
phase.updateShiftRule(shift.id,{name:"Another correction"});
await assert.rejects(()=>phase.keepCloudWorkforceRosterConflict(
  await phase.reviewWorkforceRosterConflict(nextEvent.id)),/multiple unconfirmed/);
const second=pending().at(-1);
assert.equal(second.status,"pending");
const before=structuredClone(pending());
permissions.setCurrentRole("cashier");
await assert.rejects(()=>phase.keepCloudWorkforceRosterConflict(staleReview),/Permission denied/);
assert.deepEqual(pending(),before);
permissions.setCurrentRole("admin");

// Reset just this test fixture's pending events as explicitly discarded, preserving audit.
// Then test an unsynced roster creation with no remote counterpart.
for(const e of pending())outbox.discardWorkforceRosterConflictEvent(e.id);
const slot=phase.assignRosterSlot({staffId:"staff-1",workDate:"2026-10-19",
  shiftRuleId:shift.id,branchId:null,status:"scheduled"});
const slotEvent=pending()[0];
writer.registerRemoteWriter({getRosterSlot:async()=>null});
const missing=await phase.reviewWorkforceRosterConflict(slotEvent.id);
await phase.keepCloudWorkforceRosterConflict(missing);
assert.equal(phase.listRosterSlots().some(s=>s.id===slot.id),false);
assert.equal(slotEvent.status,"discarded");
assert.equal(slotEvent.payload.id,slot.id);

// Revocation midway through the refreshed authority read must preserve the local pending event.
const late=phase.updateShiftRule(shift.id,{name:"Late correction"});
const lateEvent=pending()[0];
let release,started;
const waiter=new Promise(resolve=>{release=resolve;});
const begun=new Promise(resolve=>{started=resolve;});
writer.registerRemoteWriter({getRosterShift:async()=>{started();await waiter;return {...late,name:"Cloud",version:11};}});
const reviewed=await (async()=>{
  // First request must complete to provide the UI reviewed snapshot.
  writer.registerRemoteWriter({getRosterShift:async()=>({...late,name:"Cloud",version:11})});
  return phase.reviewWorkforceRosterConflict(lateEvent.id);
})();
writer.registerRemoteWriter({getRosterShift:async()=>{started();await waiter;return {...late,name:"Cloud",version:11};}});
const resolving=phase.keepCloudWorkforceRosterConflict(reviewed);
await begun;
writer.registerRemoteWriter(null);
release();
await assert.rejects(resolving,/session changed while reviewing/);
assert.equal(lateEvent.status,"pending");
assert.equal(phase.listShiftRules(true).find(s=>s.id===shift.id).name,"Late correction");
writer.registerRemoteWriter(null);
console.log("HR-004 Keep Cloud: explicit review, stale version, dependent events, RBAC, revocation and event history PASS");
