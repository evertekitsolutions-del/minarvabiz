import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const pure={exports:{}};vm.runInNewContext(compile('apps/web/src/lib/roster-policy-client.ts'),{exports:pure.exports});
let token='session-a',generation=1,role='manager',hydrated=true,swapOnAuth=false,swapOnRead=false,reads=0,writes=0;
const org='10000000-0000-4000-8000-000000000001';
const modules={
 '@minarvabiz/business-logic':{can:()=>true,getSessionToken:()=>token,getSessionUser:()=>({id:'user-a'}),getRemoteWriterGeneration:()=>generation},
 '@minarvabiz/database':{configFromEnv:()=>({url:'https://example.invalid',anonKey:'public'}),
  pgSelectAll:async(cfg,table)=>{reads++;assert.equal(cfg.accessToken,'session-a');assert.equal(table,'staff_roster_time_policies');if(swapOnRead)generation++;return {data:[],error:null}},
  pgRpc:async()=>{writes++;return {data:{accepted:false,remote:null},error:null}}},
 './data-source':{isRosterHydrated:()=>hydrated,resolveOnlineAuthorization:async()=>{if(swapOnAuth)token='session-b';return {ok:true,role,orgId:org}}},
 './roster-policy-client':pure.exports,
};
const loaded={exports:{}};
vm.runInNewContext(compile('apps/web/src/lib/roster-policy-online.ts'),{exports:loaded.exports,require:n=>{assert.ok(modules[n],n);return modules[n]}});
const {onlineRosterPolicies}=loaded.exports;
assert.equal((await onlineRosterPolicies().list()).length,0);
role='cashier';await assert.rejects(onlineRosterPolicies().list(),/manager/);assert.equal(reads,1);
role='manager';swapOnAuth=true;await assert.rejects(onlineRosterPolicies().list(),/session changed/);assert.equal(reads,1);
swapOnAuth=false;token='session-a';swapOnRead=true;await assert.rejects(onlineRosterPolicies().list(),/session changed/);
swapOnRead=false;const pinned=onlineRosterPolicies();generation++;
await assert.rejects(pinned.save({branchId:'20000000-0000-4000-8000-000000000001',effectiveFrom:'2026-11-01',effectiveUntil:null,ianaZone:'UTC',foldPolicy:'reject',minimumRestMinutes:0,expectedVersion:0}),/session changed/);
assert.equal(writes,0);
hydrated=false;assert.throws(()=>onlineRosterPolicies(),/session changed/);
console.log('Online roster policy adapter: server role, hydration, token and writer generation guards PASS');
