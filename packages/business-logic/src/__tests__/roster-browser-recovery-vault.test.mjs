/**
 * HR-004B cryptographic recovery foundation regression.
 * Uses Node WebCrypto and an in-memory IndexedDB-port equivalent; does NOT
 * assert full browser crash/relogin integration or automatic event replay.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
import {webcrypto} from "node:crypto";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(m,f)=>m._compile(
  ts.transpileModule(fs.readFileSync(f,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText,f,
);
Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
const vault=require("../../../../apps/web/src/lib/roster-recovery-vault.ts");
const db=new Map();
const driver={
  read:async key=>db.get(key)??null,
  write:async (row, expected)=>{
    const before=db.get(row.scopeKey);
    if ((before?.revision??0)!==expected || row.revision!==expected+1) {
      throw new Error("Roster recovery was changed in another tab");
    }
    db.set(row.scopeKey,row);
  },
  erase:async (key,expected)=>{
    const current=db.get(key);
    if (!current || (current.revision??0)!==expected)
      throw new Error("Roster recovery changed in another tab; refuse stale deletion");
    db.delete(key);
  },
};
const uuid=()=>webcrypto.randomUUID();
const userA=uuid(),userB=uuid(),orgA=uuid(),orgB=uuid();
const scope={userId:userA,organizationId:orgA};
const event={
  id:uuid(),aggregateType:"staff_shift_rules",aggregateId:uuid(),
  eventType:"update",payload:{
    id:"",name:"Offline revised shift",startTime:"09:00",endTime:"17:00",
    unpaidBreakMinutes:30,branchId:null,active:true,version:4,
  },
  occurredAt:"2026-10-09T12:00:00.000Z",deviceId:uuid(),sequence:7,
  status:"failed",attempts:2,lastError:"HTTP 409 / possible accidental header echo",
};
event.payload.id=event.aggregateId;
await vault.saveSealedRosterRecovery(driver,scope,[event]);
assert.equal(db.size,1);
const sealed=[...db.values()][0];
assert.equal(sealed.key.extractable,false,"Key must never be exported");
assert.equal(sealed.key.algorithm.name,"AES-GCM");
assert.equal(sealed.iv.length,12);
assert.equal(Array.isArray(sealed.ciphertext),true);
assert.equal(JSON.stringify(sealed).includes("Offline revised shift"),false,
  "Native browser storage must never contain plaintext roster names");
assert.equal(JSON.stringify(sealed).includes("HTTP 409"),false);
const restored=await vault.loadSealedRosterRecovery(driver,scope);
assert.equal(restored.length,1);
assert.equal(restored[0].id,event.id);
assert.equal(restored[0].deviceId,event.deviceId);
assert.equal(restored[0].payload.name,event.payload.name);
assert.equal(restored[0].lastError,null,"Untrusted server error text must not be retained");
assert.equal(restored[0].status,"failed");
assert.equal(restored[0].sequence,event.sequence);

// A new instance uses the saved CryptoKey to decrypt after simulated reload.
const reopened={read:key=>Promise.resolve(db.get(key)??null),
  write:driver.write,erase:driver.erase};
assert.deepEqual(await vault.loadSealedRosterRecovery(reopened,scope),restored);

// Each verified user/tenant combination has a different read partition.
assert.equal(await vault.loadSealedRosterRecovery(driver,{userId:userB,organizationId:orgA}),null);
assert.equal(await vault.loadSealedRosterRecovery(driver,{userId:userA,organizationId:orgB}),null);
const fresh=[{...event,id:uuid(),aggregateId:uuid(),payload:{...event.payload,id:""},status:"pending"}];
fresh[0].payload.id=fresh[0].aggregateId;
await vault.saveSealedRosterRecovery(driver,{userId:userB,organizationId:orgA},fresh);
assert.equal(db.size,2);
assert.notEqual([...db.values()][0].key,[...db.values()][1].key);
assert.deepEqual(await vault.loadSealedRosterRecovery(driver,scope),restored);

// Exact error/secret injection is refused, not serialized for later recovery.
for(const bad of [
  {...event,access_token:"credential"},
  {...event,payload:{...event.payload,jwt:"forbidden"}},
  {...event,payload:{...event.payload,refresh_token:"forbidden"}},
  {...event,aggregateType:"payments"},
  {...event,payload:{...event.payload,version:0}},
  {...event,payload:{...event.payload,startTime:"25:99"}},
  {...event,payload:{...event.payload,endTime:"24:00"}},
  {...event,sequence:0},
  {...event,deviceId:"untrusted"},
]) {
  await assert.rejects(()=>vault.saveSealedRosterRecovery(driver,scope,[bad]));
}
await assert.rejects(()=>vault.saveSealedRosterRecovery(driver,scope,[event,event]),/duplicate/);
await assert.rejects(()=>vault.saveSealedRosterRecovery(driver,{
  userId:userA,organizationId:"unverified"},[event]),/verified/);
assert.deepEqual(await vault.loadSealedRosterRecovery(driver,scope),restored,
  "Invalid attempted writes cannot corrupt the existing encrypted backup");

// Explicit metadata swap between different users or tenants must fail closed.
const swapped={...sealed,userId:userB};
await driver.write({...swapped,revision:sealed.revision+1},sealed.revision);
await assert.rejects(()=>vault.loadSealedRosterRecovery(driver,scope),/scope or encrypted record is corrupt/);
await driver.write({...sealed,revision:sealed.revision+2},sealed.revision+1);
const tampered={...sealed,ciphertext:sealed.ciphertext.map((x,i)=>i===8?x^1:x)};
await driver.write({...tampered,revision:sealed.revision+3},sealed.revision+2);
await assert.rejects(()=>vault.loadSealedRosterRecovery(driver,scope),/authentication failed/);
await driver.write({...sealed,revision:sealed.revision+4},sealed.revision+3);

// Re-encryption uses a fresh nonce on every write, with no plaintext exposure.
await vault.saveSealedRosterRecovery(driver,scope,[event]);
const newest=[...db.values()].find(x=>x.userId===userA);
assert.notDeepEqual(newest.iv,sealed.iv);
assert.equal(newest.key,sealed.key,"Existing sealed key is stable on crash recovery");
assert.deepEqual(await vault.loadSealedRosterRecovery(driver,scope),restored);


// Simulate two browser tabs reading the same revision before both encrypt.
// Compare-and-swap must reject the loser and preserve the winner's checkpoint.
const current=await driver.read(newest.scopeKey);
let readCount=0,unlock;
const gate=new Promise(resolve=>{unlock=resolve;});
const concurrent={
  read:async key=>{
    const result=await driver.read(key);
    readCount++;
    if(readCount===2)unlock();
    await gate;
    return result;
  },
  write:driver.write,
  erase:driver.erase,
};
const tabA=[{...event,id:uuid(),aggregateId:uuid(),
  payload:{...event.payload,id:"",name:"Tab A keeps its own correction"}}];
tabA[0].payload.id=tabA[0].aggregateId;
const tabB=[{...event,id:uuid(),aggregateId:uuid(),
  payload:{...event.payload,id:"",name:"Tab B competing correction"}}];
tabB[0].payload.id=tabB[0].aggregateId;
const both=await Promise.allSettled([
  vault.saveSealedRosterRecovery(concurrent,scope,tabA),
  vault.saveSealedRosterRecovery(concurrent,scope,tabB),
]);
assert.equal(both.filter(x=>x.status==="fulfilled").length,1);
const loser=both.find(x=>x.status==="rejected");
assert.match(String(loser.reason),/changed in another tab/);
const afterRace=await vault.loadSealedRosterRecovery(driver,scope);
assert.equal(afterRace.length,1);
assert.ok([tabA[0].id,tabB[0].id].includes(afterRace[0].id));
assert.equal((await driver.read(newest.scopeKey)).revision,current.revision+1);
await assert.rejects(()=>driver.write({...current,revision:current.revision+1},
  current.revision),/changed in another tab/);
assert.deepEqual(await vault.loadSealedRosterRecovery(driver,scope),afterRace,
  "Rejected concurrent writer may not erase or overwrite the acknowledged checkpoint");

// A stale browser tab cannot erase an intervening newer checkpoint.
await assert.rejects(()=>driver.erase(newest.scopeKey,current.revision),
  /changed in another tab/);
assert.deepEqual(await vault.loadSealedRosterRecovery(driver,scope),afterRace,
  "Stale explicit deletion must not destroy a newly sealed event");

// Deletion is explicit per scope; unrelated organization data must survive.
await vault.eraseSealedRosterRecovery(driver,scope);
assert.equal(await vault.loadSealedRosterRecovery(driver,scope),null);
assert.equal((await vault.loadSealedRosterRecovery(driver,{
  userId:userB,organizationId:orgA})).length,1);
console.log("HR-004B encrypted vault: reload, tenant isolation, nonextractable key, secret rejection, tamper and scoped erase PASS");
