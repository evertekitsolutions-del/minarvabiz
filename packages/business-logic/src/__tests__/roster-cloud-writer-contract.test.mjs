import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript"), Module=require("node:module");
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,f);
let replies={accepted:["event-1"],rejected:[]},sent=[];
const original=Module._load;
const cfg={accessToken:"authenticated-tenant-jwt"};
Module._load=function(name,parent,isMain){
  if(name==="@minarvabiz/database")return {
    configFromEnv:()=>cfg,
    pgSelectAll:async()=>({data:[],error:null}),
    pgRpc:async()=>({data:{accepted:true,id:"shift-1"},error:null}),
    pgSelect:async()=>({data:[],error:null}),
    pgInsert:async()=>({error:null}),
    pgUpdate:async()=>({error:null}),
  };
  if(name==="@minarvabiz/business-logic")return {
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
console.log("HR-004 authenticated RPC adapter: immutable replay identity, refusal and acknowledgement tests PASS");
