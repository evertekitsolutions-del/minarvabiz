import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,f);

const user="11111111-1111-4111-8111-111111111111";
const organization="22222222-2222-4222-8222-222222222222";
const shiftId="33333333-3333-4333-8333-333333333333";
const deviceId="44444444-4444-4444-8444-444444444444";
const tokenValue="current-authorized-jwt";
const cloud={id:shiftId,name:"Base shift",startTime:"09:00",endTime:"17:00",
  unpaidBreakMinutes:30,branchId:null,active:true,version:1};
const local1={...cloud,name:"First name",version:2};
const local2={...cloud,name:"Final name",version:3};
const scope={userId:user,organizationId:organization};
function pending(index,payload){
  return {id:`55555555-5555-4555-8555-55555555555${index}`,
    aggregateType:"staff_shift_rules",aggregateId:shiftId,eventType:"update",
    payload:{...payload},occurredAt:"2026-10-11T00:00:00Z",
    deviceId,sequence:30+index,status:"failed",attempts:1,lastError:"recovery"};
}
const events=[pending(1,local1),pending(2,local2)];
function compare(e,remote=cloud){
  return {
    eventId:e.id,aggregateType:e.aggregateType,aggregateId:e.aggregateId,
    eventType:e.eventType,deviceId:e.deviceId,sequence:e.sequence,
    localStatus:e.status,localVersion:e.payload.version,
    remoteVersion:remote?.version??null,remotePresence:remote?"visible":"missing-or-hidden",
    localPayload:{...e.payload},remotePayload:remote?{...remote}:null,
    sameDayCloudPeers:null,
  };
}
const approved={scope,total:2,comparisons:events.map(e=>compare(e))};
const planner=require("../../../../apps/web/src/lib/roster-recovery-chain.ts").planReviewedSealedRosterChain;
const valid=planner(approved);
assert.equal(valid.eligible,true,JSON.stringify(valid));
assert.deepEqual(valid.eventIds,events.map(e=>e.id));
assert.equal(valid.finalVersion,3);
assert.equal(planner({...approved,total:3}).eligible,false);
assert.equal(planner({...approved,comparisons:[approved.comparisons[1],approved.comparisons[0]]}).eligible,false);
assert.equal(planner({...approved,comparisons:[approved.comparisons[0],approved.comparisons[0]]}).eligible,false);
assert.equal(planner({...approved,comparisons:[approved.comparisons[0],
  {...approved.comparisons[1],deviceId:"another-device"}]}).eligible,false);
assert.equal(planner({...approved,comparisons:[approved.comparisons[0],
  {...approved.comparisons[1],aggregateId:"other-record"}]}).eligible,false);
assert.equal(planner({...approved,comparisons:[approved.comparisons[0],
  {...approved.comparisons[1],localVersion:4}]}).eligible,false);
assert.equal(planner({...approved,comparisons:[approved.comparisons[0],
  {...approved.comparisons[1],eventType:"insert"}]}).eligible,false);
assert.equal(planner({...approved,comparisons:[approved.comparisons[0],
  {...approved.comparisons[1],remotePresence:"missing-or-hidden",remotePayload:null,remoteVersion:null}]}).eligible,false);
assert.equal(planner({...approved,comparisons:[approved.comparisons[0],
  {...approved.comparisons[1],remotePayload:{...cloud,name:"changed"}}]}).eligible,false);
const slotBase={id:"66666666-6666-4666-8666-666666666666",
  staffId:"77777777-7777-4777-8777-777777777777",shiftRuleId:shiftId,
  branchId:null,workDate:"2026-10-11",status:"scheduled",version:2};
function slotCompare(version,index){
  const payload={...slotBase,version,status:version===3?"cancelled":"scheduled"};
  return {eventId:`88888888-8888-4888-8888-88888888888${index}`,
    aggregateType:"staff_roster_slots",aggregateId:slotBase.id,eventType:"update",
    deviceId,sequence:40+index,localStatus:"failed",localVersion:version,
    remoteVersion:2,remotePresence:"visible",localPayload:payload,
    remotePayload:{...slotBase},
    sameDayCloudPeers:[{...slotBase}],
  };
}
const slotApproved={scope,total:2,comparisons:[slotCompare(3,1),slotCompare(4,2)]};
assert.equal(planner(slotApproved).eligible,true);
assert.equal(planner({...slotApproved,comparisons:[slotApproved.comparisons[0],
  {...slotApproved.comparisons[1],sameDayCloudPeers:[]}]}).eligible,false);
assert.equal(planner({...slotApproved,comparisons:[slotApproved.comparisons[0],
  {...slotApproved.comparisons[1],sameDayCloudPeers:[{...slotBase,id:"foreign-id"}]}]}).eligible,false);
for(const peer of [
  {...slotBase,shiftRuleId:"another-shift"},
  {...slotBase,branchId:"another-branch"},
  {...slotBase,status:"cancelled"},
]) {
  assert.equal(planner({...slotApproved,comparisons:[
    slotApproved.comparisons[0],
    {...slotApproved.comparisons[1],sameDayCloudPeers:[peer]}
  ]}).eligible,false,"Changed peer shift, branch or status must block ordered recovery");
}
assert.equal(planner({...slotApproved,comparisons:[slotApproved.comparisons[0],
  {...slotApproved.comparisons[1],localPayload:{...slotApproved.comparisons[1].localPayload,staffId:"other-staff"}}]}).eligible,false);

let token=tokenValue,role=true,currentUser=user,generation=1;
let writes=0,reads=0,changeDuringCloud=null,failHydrate=false;
const writer={upsertRosterEvent:async()=>{writes++;}};
let sealed=structuredClone(events), report=structuredClone(approved);
let history=[];
let store={shiftRules:[{...cloud}],rosterSlots:[]};
const core={
  can:p=>p==="staff.manage"&&role,
  exportOutbox:()=>history,
  getRemoteWriter:()=>writer,
  getRemoteWriterGeneration:()=>generation,
  getSessionToken:()=>token,
  getSessionUser:()=>currentUser?{id:currentUser}:null,
  hydrateOutbox:queue=>{history=structuredClone(queue);},
  workforceRoster:{validateShiftRule:rule=>{
    if(typeof rule.name!=="string"||!rule.name.trim()||rule.version<1)
      throw Error("Invalid intermediate shift");
  }},
  phase6Store:{
    exportPhase6State:()=>structuredClone(store),
    hydratePhase6:state=>{
      if(failHydrate && state.shiftRules?.[0]?.name==="Final name")
        throw Error("simulated snapshot validation error");
      store=structuredClone(state);
    },
  },
};
const checkpoint={
  compareSealedRosterCheckpointWithCloud:async()=>{
    reads++;if(changeDuringCloud)await changeDuringCloud;
    return structuredClone(report);
  },
  inspectSealedRosterCheckpoint:async()=>({scope:{...scope},events:structuredClone(sealed)}),
};
const origin=Module._load;
Module._load=function(name,parent,isMain){
  if(name==="@minarvabiz/business-logic")return core;
  if(name==="./roster-recovery-checkpoint")return checkpoint;
  return origin.call(this,name,parent,isMain);
};
let module;
try{module=require("../../../../apps/web/src/lib/roster-recovery-restore.ts");}
finally{Module._load=origin;}
const restore=module.restoreReviewedSealedRosterChainToMemory;
const successful=await restore(approved);
assert.deepEqual(successful,{eventIds:events.map(e=>e.id),finalVersion:3});
assert.equal(store.shiftRules[0].name,"Final name");
assert.deepEqual(history.map(e=>e.id),events.map(e=>e.id));
assert.deepEqual(history.map(e=>e.sequence),events.map(e=>e.sequence));
assert.deepEqual(history.map(e=>e.payload),events.map(e=>e.payload));
assert.deepEqual(history.map(e=>e.status),["failed","failed"]);
assert.deepEqual(sealed,events,"Encrypted source must never be changed or acknowledged");
assert.equal(writes,0,"Recovery must NEVER auto-write to Cloud");
assert.ok(reads>0);

// Repeated restore must refuse duplicated original IDs and retain memory.
const savedState=structuredClone(store),savedHistory=structuredClone(history);
await assert.rejects(()=>restore(approved),/duplicate outbox/);
assert.deepEqual(store,savedState);assert.deepEqual(history,savedHistory);
history=[];store={shiftRules:[{...cloud}],rosterSlots:[]};
const refused=async(modified,pattern)=>{
  const untouchedSealed=structuredClone(sealed);
  await assert.rejects(()=>restore(modified),pattern);
  assert.equal(store.shiftRules[0].name,cloud.name);
  assert.equal(history.length,0);
  assert.deepEqual(sealed,untouchedSealed,
    "A rejected restore must never alter even an intentionally tampered sealed fixture");
};
role=false;await refused(approved,/Authorized roster manager/);role=true;
token=null;await refused(approved,/Authorized roster manager/);token=tokenValue;
report=structuredClone(approved);
report.comparisons[1].remoteVersion=2;
await refused(approved,/Cloud or encrypted roster chain changed/);
report=structuredClone(approved);
sealed[0].sequence=999;
await refused(approved,/Immutable sealed recovery chain differs/);
sealed=structuredClone(events);
const lostEvent=sealed.pop();
await refused(approved,/Encrypted recovery chain count/);
sealed.push(lostEvent);
failHydrate=true;
await refused(approved,/simulated snapshot validation error/);
failHydrate=false;
const badHistorical=structuredClone(approved);
badHistorical.comparisons[1].localPayload.startTime="08:00";
report=structuredClone(badHistorical);
sealed[1].payload.startTime="08:00";
store.rosterSlots=[{...slotBase}];
await refused(badHistorical,/Historical shift timing/);
store.rosterSlots=[];sealed=structuredClone(events);report=structuredClone(approved);
let unlock;
changeDuringCloud=new Promise(resolve=>{unlock=resolve;});
const inFlight=restore(approved);
await new Promise(resolve=>setImmediate(resolve));
generation+=1;unlock();changeDuringCloud=null;
await assert.rejects(inFlight,/session or organization changed/);
assert.equal(history.length,0);assert.equal(writes,0);

// A two-revision roster assignment chain must respect the reviewed same-day
// canonical peer and all previous local baseline identity without Cloud writes.
generation+=1;
store={shiftRules:[{...cloud}],rosterSlots:[{...slotBase}]};
const slotEvents=slotApproved.comparisons.map(c=>({
 id:c.eventId,aggregateType:c.aggregateType,aggregateId:c.aggregateId,
 eventType:"update",deviceId:c.deviceId,sequence:c.sequence,
 payload:{...c.localPayload},status:"failed",occurredAt:"2026-10-11T00:00:00Z",
 attempts:1,lastError:null
}));
sealed=structuredClone(slotEvents);report=structuredClone(slotApproved);
const slotRestored=await restore(slotApproved);
assert.equal(slotRestored.finalVersion,4);
assert.equal(store.rosterSlots[0].id,slotBase.id);
assert.equal(store.rosterSlots[0].version,4);
assert.deepEqual(history.map(e=>e.id),slotEvents.map(e=>e.id));
assert.equal(writes,0);
history=[];sealed=structuredClone(events);report=structuredClone(approved);

// Browser must not expose a cloud-replay operation from this restore button.
const ui=fs.readFileSync("apps/web/src/app/(app)/roster/page.tsx","utf8");
assert.match(ui,/planReviewedSealedRosterChain\(sealedReview\)/);
assert.match(ui,/restoreReviewedSealedRosterChainToMemory\(sealedReview\)/);
assert.match(ui,/Restore reviewed ordered same-ID chain locally/);
assert.match(ui,/No Cloud write occurred/);
assert.match(ui,/click Retry separately/);
assert.match(fs.readFileSync("apps/web/src/lib/roster-recovery-chain.ts","utf8"),
  /never modifies|never.*Cloud write/i);
console.log("HR004B reviewed multi-event LOCAL restore: immutable chains, revision/order/peer denial, rollback, auth swap and no Cloud RPC PASS");
