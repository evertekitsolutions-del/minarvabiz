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
let token="verified-token",generation=1,role=true,currentUser=user,authorized=true;
let events=[],authCalls=0,pausedAuthorization=null;
const sealed=new Map();
const writes=[];
const vault={
  createIndexedDbRosterRecoveryDriver:()=>({}),
  loadSealedRosterRecovery:async(_driver,scope)=>sealed.get(scope.userId+":"+scope.organizationId)??null,
  saveSealedRosterRecovery:async(_driver,scope,list)=>{
    const safe=structuredClone(list);sealed.set(scope.userId+":"+scope.organizationId,safe);
    writes.push({scope:{...scope},events:safe});
  },
};
const business={
  can:permission=>permission==="staff.manage"&&role,
  exportOutbox:()=>events,
  getRemoteWriterGeneration:()=>generation,
  getSessionToken:()=>token,
  getSessionUser:()=>currentUser?{id:currentUser}:null,
};
const nativeLoad=Module._load;
Module._load=function(spec,parent,isMain){
  if(spec==="@minarvabiz/business-logic")return business;
  if(spec==="./roster-recovery-vault")return vault;
  if(spec==="./data-source")return {resolveOnlineAuthorization:async(_token,id)=>{
    authCalls++;
    if(pausedAuthorization)await pausedAuthorization;
    return authorized?{ok:true,orgId:organization,role:"admin"}:{ok:false,error:"forbidden"};
  }};
  return nativeLoad.apply(this,arguments);
};
let checkpoints;
try{checkpoints=require("../../../../apps/web/src/lib/roster-recovery-checkpoint.ts");}
finally{Module._load=nativeLoad;}

const event={
 id:"33333333-3333-4333-8333-333333333333",aggregateType:"staff_shift_rules",
 aggregateId:"44444444-4444-4444-8444-444444444444",
 eventType:"update",payload:{id:"44444444-4444-4444-8444-444444444444",version:2},
 occurredAt:"2026-10-09T00:00:00Z",deviceId:"55555555-5555-4555-8555-555555555555",
 sequence:1,status:"failed",attempts:1,lastError:null
};
const key=user+":"+organization;
events=[{...event}];
assert.equal(await checkpoints.checkpointUnconfirmedRosterEvents(),1);
assert.equal(writes.length,1);
assert.equal(writes[0].scope.organizationId,organization);
assert.equal(writes[0].events[0].id,event.id);
assert.equal((await checkpoints.inspectSealedRosterCheckpoint()).events.length,1);

// An event ID cannot be reused for a different immutable payload/sequence.
events=[{...event,payload:{...event.payload,version:3}}];
await assert.rejects(()=>checkpoints.checkpointUnconfirmedRosterEvents(),/Immutable encrypted roster event differs/);
assert.equal(sealed.get(key)[0].payload.version,2);
events=[{...event}];

// A truncated/reloaded memory queue must NOT overwrite the sealed pending event.
events=[];
await assert.rejects(()=>checkpoints.checkpointUnconfirmedRosterEvents(),/reviewed recovery/);
assert.equal(sealed.get(key).length,1);
await assert.rejects(()=>checkpoints.checkpointUnconfirmedRosterEvents([event.id]),/reviewed recovery/,
 "A caller-supplied ID alone cannot prove server RPC acknowledgement");

// Only an identical local event ID with audited synced/discarded status allows clear.
events=[{...event,status:"synced"}];
await assert.rejects(()=>checkpoints.checkpointUnconfirmedRosterEvents(),/reviewed recovery/);
assert.equal(await checkpoints.checkpointUnconfirmedRosterEvents([event.id]),0);
assert.deepEqual(sealed.get(key),[]);

// A resolved org/user identity is required for every read or write.
token=null;
await assert.rejects(()=>checkpoints.inspectSealedRosterCheckpoint(),/Authorized roster manager session/);
token="verified-token";role=false;
await assert.rejects(()=>checkpoints.checkpointUnconfirmedRosterEvents(),/Authorized roster manager session/);
role=true;authorized=false;
await assert.rejects(()=>checkpoints.checkpointUnconfirmedRosterEvents(),/organization authorization failed/);
authorized=true;

// Session/tenant swap DURING authority lookup must abort before any persistence.
events=[{...event,status:"pending"}];
let unlock;
pausedAuthorization=new Promise(resolve=>{unlock=resolve;});
const preWriteCount=writes.length;
const stopped=checkpoints.checkpointUnconfirmedRosterEvents();
await new Promise(resolve=>setImmediate(resolve));
generation=2;
unlock();pausedAuthorization=null;
await assert.rejects(stopped,/session changed while authorizing/);
assert.equal(writes.length,preWriteCount);

// New account must select its own organization partition (never old queue).
generation=3;currentUser="66666666-6666-4666-8666-666666666666";
events=[];
assert.deepEqual((await checkpoints.inspectSealedRosterCheckpoint()).events,[]);
assert.equal(await checkpoints.checkpointUnconfirmedRosterEvents(),0);
assert.deepEqual(writes.at(-1).scope,{
 userId:"66666666-6666-4666-8666-666666666666",organizationId:organization
});
assert.deepEqual(sealed.get(key),[],"Earlier user's partition is not changed");

const page=fs.readFileSync("apps/web/src/app/(app)/roster/page.tsx","utf8");
const core=fs.readFileSync("packages/business-logic/src/phase6-store.ts","utf8");
assert.match(page,/recoveryState === "ready"/);
assert.match(page,/inspectSealedRosterCheckpoint\(\)/);
assert.match(page,/checkpointUnconfirmedRosterEvents\(\)/);
assert.match(page,/await checkpointUnconfirmedRosterEvents\(\);\s*await phase6Store\.flushWorkforceRosterOutbox\(\)/);
assert.match(page,/No automatic replay or overwrite was performed/);
assert.match(core,/if \(beforeFlush\) await beforeFlush\(\);/);
assert.ok(authCalls>3);
console.log("HR-004B Web integration: RPC-authorized scope, prewrite, acknowledgement, revoked session and crash quarantine PASS");
