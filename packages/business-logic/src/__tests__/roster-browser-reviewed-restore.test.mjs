import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,f);

const user="11111111-1111-4111-8111-111111111111";
const org="22222222-2222-4222-8222-222222222222";
const shiftId="33333333-3333-4333-8333-333333333333";
const eventId="44444444-4444-4444-8444-444444444444";
const deviceId="55555555-5555-4555-8555-555555555555";
let role=true,token="authorized-session",identity=user,generation=1;
let cloudWrites=0, hydrations=0, readCount=0, comparisonHold=null;
const currentWriter={upsertRosterEvent:async()=>{cloudWrites++;}};
const cloud={id:shiftId,name:"Cloud shift",startTime:"09:00",endTime:"17:00",
  unpaidBreakMinutes:30,branchId:null,active:true,version:1};
const desired={...cloud,name:"Saved revised shift",version:2};
const event={id:eventId,aggregateType:"staff_shift_rules",aggregateId:shiftId,
  eventType:"update",payload:{...desired},occurredAt:"2026-10-09T16:00:00.000Z",
  deviceId,sequence:12,status:"failed",attempts:2,lastError:null};
const scope={userId:user,organizationId:org};
const item={eventId,aggregateType:"staff_shift_rules",aggregateId:shiftId,
  localStatus:"failed",localVersion:2,remoteVersion:1,
  remotePresence:"visible",localPayload:{...desired},remotePayload:{...cloud}};
const approved={scope,total:1,comparisons:[item]};
let report=structuredClone(approved),sealed=[{...event}];
const store={shiftRules:[{...cloud}],rosterSlots:[]};
let memory=[];
const core={
  can:code=>code==="staff.manage"&&role,
  exportOutbox:()=>memory,
  getRemoteWriter:()=>currentWriter,
  getRemoteWriterGeneration:()=>generation,
  getSessionToken:()=>token,
  getSessionUser:()=>identity?{id:identity}:null,
  hydrateOutbox:events=>{memory=events.map(e=>({...e}));},
  phase6Store:{
    exportPhase6State:()=>structuredClone(store),
    hydratePhase6:input=>{
      hydrations++;
      if(input.shiftRules?.some(r=>r.name==="BROKEN"))throw new Error("Roster snapshot invalid");
      if(input.shiftRules)store.shiftRules=structuredClone(input.shiftRules);
      if(input.rosterSlots)store.rosterSlots=structuredClone(input.rosterSlots);
    },
  },
};
const checkpoint={
  compareSealedRosterCheckpointWithCloud:async ()=>{
    readCount++;if(comparisonHold)await comparisonHold;return structuredClone(report);
  },
  inspectSealedRosterCheckpoint:async ()=>({scope:{...scope},events:structuredClone(sealed)}),
};
const originalLoader=Module._load;
Module._load=function(name,parent,isMain){
  if(name==="@minarvabiz/business-logic")return core;
  if(name==="./roster-recovery-checkpoint")return checkpoint;
  return originalLoader.apply(this,arguments);
};
let module;
try{module=require("../../../../apps/web/src/lib/roster-recovery-restore.ts");}
finally{Module._load=originalLoader;}
const restore=module.restoreReviewedSealedRosterEventToMemory;
const result=await restore(approved);
assert.deepEqual(result,{eventId,aggregateType:"staff_shift_rules"});
assert.equal(store.shiftRules[0].name,desired.name);
assert.equal(store.shiftRules[0].version,2);
assert.equal(memory.length,1);
assert.equal(memory[0].id,eventId);
assert.equal(memory[0].deviceId,deviceId);
assert.equal(memory[0].sequence,event.sequence);
assert.deepEqual(memory[0].payload,event.payload);
assert.equal(memory[0].status,"failed","Recovery never acknowledges an RPC");
assert.equal(cloudWrites,0,"Recovering local memory must never send a Cloud RPC");
assert.deepEqual(sealed,[event],"Original encrypted checkpoint stays intact");
assert.ok(readCount>0);

// Unauthorized and different session context must fail before touching memory.
role=false;
await assert.rejects(()=>restore(approved),/Authorized roster manager/);
role=true;token=null;
await assert.rejects(()=>restore(approved),/Authorized roster manager/);
token="authorized-session";
const before=structuredClone(store);
const beforeQueue=structuredClone(memory);
await assert.rejects(()=>restore(approved),/Existing unconfirmed\/duplicate events/);
assert.deepEqual(store,before);
assert.deepEqual(memory,beforeQueue);

// Cloud advanced after UI review: refuse stale restoration without state changes.
memory=[];report=structuredClone(approved);
report.comparisons[0].remoteVersion=2;
await assert.rejects(()=>restore(approved),/changed since review/);
report=structuredClone(approved);

// Already changed current Cloud hydrated state: reject.
store.shiftRules[0]={...cloud,version:3};
await assert.rejects(()=>restore(approved),/does not match the reviewed authorized Cloud snapshot/);
store.shiftRules[0]={...cloud};

// Wrong canonical identity or unsafe version relationship: no restore.
const forged=structuredClone(approved);
forged.comparisons[0].remoteVersion=4;
await assert.rejects(()=>restore(forged),/Unsafe Cloud revision/);
const hidden=structuredClone(approved);
hidden.comparisons[0].remotePresence="missing-or-hidden";
hidden.comparisons[0].remotePayload=null;
await assert.rejects(()=>restore(hidden),/Unsafe Cloud revision/);
const duplicate=structuredClone(approved);
duplicate.total=2;
await assert.rejects(()=>restore(duplicate),/Only one/);

// A revoked session between authenticated Cloud read and memory application aborts.
let release;
comparisonHold=new Promise(resolve=>{release=resolve;});
const pending=restore(approved);
await new Promise(resolve=>setImmediate(resolve));
generation++;
release();comparisonHold=null;
await assert.rejects(pending,/session or organization changed/);
assert.equal(memory.length,0);
assert.deepEqual(store.shiftRules,[cloud]);

// Shift historical timing cannot be modified by replay.
generation++;
store.rosterSlots=[{id:"66666666-6666-4666-8666-666666666666",staffId:"staff-1",
  shiftRuleId:shiftId,branchId:null,workDate:"2026-10-09",status:"scheduled",version:1}];
const timed=structuredClone(approved);
timed.comparisons[0].localPayload.startTime="08:00";
sealed=[{...event,payload:{...event.payload,startTime:"08:00"}}];
report=structuredClone(timed);
await assert.rejects(()=>restore(timed),/rewrite previous assignments/);
assert.deepEqual(store.shiftRules,[cloud],"Historical error must never rewrite Cloud-hydrated state");
assert.equal(memory.length,0);
assert.equal(cloudWrites,0);

const ui=fs.readFileSync("apps/web/src/app/(app)/roster/page.tsx","utf8");
assert.match(ui,/restoreReviewedSealedRosterEventToMemory\(sealedReview\)/);
assert.match(ui,/Restore reviewed original event locally \(no Cloud write\)/);
assert.match(ui,/window\.confirm\(/);
assert.match(ui,/separately review and press Retry/);
console.log("HR-004B reviewed local recovery: original event, no auto-RPC, stale versions, auth swap, history, restrictions PASS");
