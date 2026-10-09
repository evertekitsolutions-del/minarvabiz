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
let cloudReads=[],cloudReply=null,pausedCloudRead=null,cloudStarted=null;
let currentReader={
  getRosterShift:async id=>{cloudReads.push({kind:"shift",id});if(cloudStarted)cloudStarted();if(pausedCloudRead)await pausedCloudRead;return cloudReply;},
  getRosterSlot:async id=>{cloudReads.push({kind:"slot",id});if(cloudStarted)cloudStarted();if(pausedCloudRead)await pausedCloudRead;return cloudReply;},
};
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
  getRemoteWriter:()=>currentReader,
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

// Read-only post-crash Cloud comparison NEVER imports or submits a sealed event.
// Its organization is resolved by the authoritative RPC for the active user.
currentUser=user;token="verified-token";role=true;authorized=true;generation=4;
sealed.set(key,[{...event,status:"failed"}]);
const oldVault=structuredClone(sealed.get(key));
cloudReply={id:event.aggregateId,version:7,name:"Cloud template",active:true};
const report=await checkpoints.compareSealedRosterCheckpointWithCloud();
assert.equal(report.scope.organizationId,organization);
assert.equal(report.comparisons.length,1);
assert.equal(report.comparisons[0].eventId,event.id);
assert.equal(report.comparisons[0].localVersion,2);
assert.equal(report.comparisons[0].remoteVersion,7);
assert.equal(report.comparisons[0].remotePresence,"visible");
assert.deepEqual(cloudReads.at(-1),{kind:"shift",id:event.aggregateId});
assert.deepEqual(sealed.get(key),oldVault,"Read-only review preserves source bytes");
const writesBeforeReview=writes.length;
assert.equal(writes.length,writesBeforeReview,"Cloud comparison cannot trigger a local checkpoint");

cloudReply=null;
const hidden=await checkpoints.compareSealedRosterCheckpointWithCloud();
assert.equal(hidden.comparisons[0].remotePresence,"missing-or-hidden");
assert.equal(hidden.comparisons[0].remoteVersion,null,
  "Hidden under RLS must NOT imply permission to create or delete");
cloudReply={id:"00000000-0000-4000-8000-000000000000",version:3};
await assert.rejects(()=>checkpoints.compareSealedRosterCheckpointWithCloud(),
  /Cloud record identity or version is invalid/);
cloudReply={id:event.aggregateId,version:7};
await assert.rejects(()=>checkpoints.compareSealedRosterCheckpointWithCloud(26),/batch size/);
await assert.rejects(()=>checkpoints.compareSealedRosterCheckpointWithCloud(0),/batch size/);

// A mid-flight tenant switch must not return a previous tenant's Cloud data.
let releaseRead;
pausedCloudRead=new Promise(resolve=>{releaseRead=resolve;});
let signalRead;
const didStart=new Promise(resolve=>{signalRead=resolve;});
cloudStarted=signalRead;
const interrupted=checkpoints.compareSealedRosterCheckpointWithCloud();
await didStart;
generation=5;
releaseRead();pausedCloudRead=null;cloudStarted=null;
await assert.rejects(interrupted,/identity changed/);
assert.deepEqual(sealed.get(key),oldVault);
generation=6;
currentReader=null;
await assert.rejects(()=>checkpoints.compareSealedRosterCheckpointWithCloud(),
  /Authenticated roster conflict readers/);
currentReader={getRosterShift:async()=>cloudReply,getRosterSlot:async()=>cloudReply};

// Different active account must not open prior user's event backup.
currentUser="66666666-6666-4666-8666-666666666666";
const other=await checkpoints.compareSealedRosterCheckpointWithCloud();
assert.equal(other.comparisons.length,0);
assert.equal(other.total,0);
currentUser=user;
assert.deepEqual(sealed.get(key),oldVault);
assert.equal(writes.length,writesBeforeReview,"No Cloud comparison may send or save an event");

assert.match(page,/Compare saved changes with Cloud \(read only\)/);
assert.match(page,/compareSealedRosterCheckpointWithCloud\(\)/);
assert.match(page,/No events were imported, discarded, sent or acknowledged/);

console.log("HR-004B Web integration: RPC-authorized scope, prewrite, acknowledgement, revoked session and crash quarantine PASS");
