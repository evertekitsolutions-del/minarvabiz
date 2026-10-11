import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript"), Module=require("node:module");
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,f);
let replies={accepted:["event-1"],rejected:[]},sent=[];
let selected=[], readRows=[], readError=null;
const original=Module._load;
const cfg={accessToken:"authenticated-tenant-jwt"};
Module._load=function(name,parent,isMain){
  if(name==="@minarvabiz/database")return {
    configFromEnv:()=>cfg,
    pgSelectAll:async()=>({data:[],error:null}),
    pgRpc:async()=>({data:{accepted:true,id:"shift-1"},error:null}),
    pgSelect:async(_cfg,table,query)=>{
      selected.push({table,query});
      return {data:readRows,error:readError};
    },
    pgInsert:async()=>({error:null}),
    pgUpdate:async()=>({error:null}),
  };
  if(name==="@minarvabiz/business-logic")return {
    workforceRoster:require("../workforce-roster.ts"),
    createSupabaseCloudAdapter:(client,deviceId)=>({
      push:async(events)=>{
        sent.push({deviceId,events});
        return replies;
      },
    }),
  };
  return original.call(this,name,parent,isMain);
};
let roster;
try{roster=require("../../../../apps/web/src/lib/data-source-roster.ts");}
finally{Module._load=original;}
const event={
  id:"event-1",deviceId:"device-1",sequence:5,aggregateType:"staff_shift_rules",
  aggregateId:"shift-1",eventType:"insert",payload:{id:"shift-1",version:1},
  status:"pending",occurredAt:"2026-10-09T00:00:00Z",attempts:0,lastError:null,
};
const writer=roster.createRosterRemoteWriter(cfg);
await writer.upsertRosterEvent(event);
assert.equal(sent[0].deviceId,"device-1");
assert.equal(sent[0].events[0].id,"event-1");
assert.equal(sent[0].events[0].sequence,5);
assert.deepEqual(sent[0].events[0].payload,event.payload);
await assert.rejects(()=>writer.upsertRosterEvent({...event,id:""}),/original immutable event identity/);
await assert.rejects(()=>writer.upsertRosterEvent({...event,aggregateType:"customers"}),/Unexpected workforce event type/);
await assert.rejects(()=>roster.createRosterRemoteWriter({accessToken:null}).upsertRosterEvent(event),/Authenticated roster write/);
replies={accepted:[],rejected:[{id:"event-1",error:"roster_version_conflict"}]};
await assert.rejects(()=>writer.upsertRosterEvent(event),/roster_version_conflict/);
replies={accepted:[],rejected:[]};
await assert.rejects(()=>writer.upsertRosterEvent(event),/did not acknowledge/);
replies={accepted:["different-event"],rejected:[]};
await assert.rejects(()=>writer.upsertRosterEvent(event),/did not acknowledge/);
assert.equal(sent.length,4,"Only authenticated, well-formed events reach the cloud adapter");

const shiftId="11111111-1111-4111-8111-111111111111";
const slotId="22222222-2222-4222-8222-222222222222";
readRows=[{id:shiftId,name:"Day",start_time:"09:00:00",end_time:"17:00:00",
  unpaid_break_minutes:30,branch_id:null,active:true,version:4}];
assert.deepEqual(await writer.getRosterShift(shiftId),{
  id:shiftId,name:"Day",startTime:"09:00",endTime:"17:00",
  unpaidBreakMinutes:30,branchId:null,active:true,version:4,
});
assert.deepEqual(selected.at(-1),{table:"staff_shift_rules",query:`select=*&id=eq.${shiftId}&limit=1`});
readRows=[{id:slotId,staff_id:"employee-1",shift_rule_id:shiftId,
  branch_id:null,work_date:"2026-10-09",status:"scheduled",version:5}];
assert.equal((await writer.getRosterSlot(slotId)).version,5);
assert.equal(selected.at(-1).table,"staff_roster_slots");
readRows=[];
assert.equal(await writer.getRosterShift(shiftId),null,"Uncommitted creates have no Cloud row");
await assert.rejects(()=>writer.getRosterShift("shift-a&id=ne.foo"),/Invalid roster conflict record ID/);
await assert.rejects(()=>writer.getRosterSlot("../org/other"),/Invalid roster conflict record ID/);
readRows=[{id:slotId,staff_id:"employee-1",shift_rule_id:shiftId,
  branch_id:null,work_date:"2026-10-09",status:"scheduled",version:5}];
await assert.rejects(()=>writer.getRosterSlot(shiftId),/Remote roster identity mismatch/);
readError={message:"RLS denied"};readRows=[];
await assert.rejects(()=>writer.getRosterShift(shiftId),/RLS denied/);
readError=null;readRows=null;
await assert.rejects(()=>writer.getRosterShift(shiftId),/Invalid roster conflict read response/);
await assert.rejects(()=>roster.createRosterRemoteWriter({accessToken:null}).getRosterShift(shiftId),
  /Authenticated roster conflict review requires a valid session/);

const staffUUID="33333333-3333-4333-8333-333333333333";
const peerUUID="44444444-4444-4444-8444-444444444444";
readRows=[{id:peerUUID,staff_id:staffUUID,shift_rule_id:shiftId,
 branch_id:null,work_date:"2026-10-09",status:"scheduled",version:3}];
const peers=await writer.getRosterDayPeers(staffUUID,"2026-10-09");
assert.equal(peers.length,1);
assert.equal(peers[0].id,peerUUID);
assert.deepEqual(selected.at(-1),{
 table:"staff_roster_slots",
 query:`select=*&staff_id=eq.${staffUUID}&work_date=eq.2026-10-09&order=id.asc&limit=26`
});
await assert.rejects(()=>writer.getRosterDayPeers("staff-injected&id=neq.x","2026-10-09"),/Invalid roster staff identity/);
await assert.rejects(()=>writer.getRosterDayPeers(staffUUID,"2026-02-30"),/Invalid cloud roster work date/);
await assert.rejects(()=>writer.getRosterDayPeers(staffUUID,"2026-10-09&org_id=neq.x"),/Invalid cloud roster work date/);
readRows=[{...readRows[0],staff_id:"55555555-5555-4555-8555-555555555555"}];
await assert.rejects(()=>writer.getRosterDayPeers(staffUUID,"2026-10-09"),/peer identity mismatch/);
readRows=[{...readRows[0],staff_id:staffUUID},{...readRows[0],staff_id:staffUUID}];
await assert.rejects(()=>writer.getRosterDayPeers(staffUUID,"2026-10-09"),/peer identity mismatch/);
readRows=Array.from({length:26},(_,i)=>({...readRows[0],id:`x-${i}`}));
await assert.rejects(()=>writer.getRosterDayPeers(staffUUID,"2026-10-09"),/incomplete or invalid/);
readRows=[];readError={message:"role has no organization access"};
await assert.rejects(()=>writer.getRosterDayPeers(staffUUID,"2026-10-09"),/role has no organization access/);
readError=null;
await assert.rejects(()=>roster.createRosterRemoteWriter({accessToken:null})
  .getRosterDayPeers(staffUUID,"2026-10-09"),/Authenticated roster day review/);
assert.ok(selected.filter(read=>read.query.includes("&id=eq.")).every(read=>read.query.includes("&limit=1")),
  "Exact ID conflict reads stay bounded");
assert.ok(selected.filter(read=>read.query.includes("&staff_id=eq."))
  .every(read=>read.query.includes("&work_date=eq.")&&read.query.includes("&limit=26")),
  "New peer reads must remain staff/date bounded");

console.log("HR-004 authorized conflict reads: exact ID, RLS denial, missing row, rejected injection and mapping PASS");
console.log("HR-004 authenticated RPC adapter: immutable replay identity, refusal and acknowledgement tests PASS");
