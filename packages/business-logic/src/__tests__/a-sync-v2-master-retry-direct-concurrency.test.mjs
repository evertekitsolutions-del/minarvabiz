import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"),{
    fileName:file,compilerOptions:{
      module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,
    },
  }).outputText,file,
);
const cloud=require("../remote-write.ts");
const outbox=require("../outbox-bridge.ts");
const OWNER="org:owner";

function reset(writer=null) {
  cloud.registerRemoteWriter(null);
  outbox.hydrateOutbox([]);
  outbox.setOutboxScope(OWNER);
  if(writer)cloud.registerRemoteWriter(writer,OWNER);
}
function gate() {
  let release;
  const promise=new Promise(resolve=>{release=resolve;});
  return {promise,release};
}
const statuses=()=>outbox.exportOutbox().map(e=>e.status);

for(const [kind,method,writerMethod] of [
  ["category","remoteUpsertCategory","upsertCategory"],
  ["customer","remoteUpsertCustomer","upsertCustomer"],
  ["product","remoteUpsertProduct","upsertProduct"],
]) {
  test(kind+": manual retry must not resend an in-flight direct event",async()=>{
    const entered=gate(),unblock=gate(),calls=[];
    reset({[writerMethod]:async data=>{
      calls.push(data.name);
      entered.release();
      await unblock.promise;
    }});
    const direct=cloud[method]({id:kind+"-dup",name:"direct"});
    await entered.promise;
    const retry=cloud.retryScopedMasterOutbox();
    assert.deepEqual(calls,["direct"],"Retry must not duplicate active cloud RPC");
    unblock.release();
    const [result]=await Promise.all([retry,direct]);
    assert.equal(result.attempted,0);
    assert.equal(result.acknowledged,0);
    assert.deepEqual(calls,["direct"]);
    assert.deepEqual(statuses(),["synced"]);
  });

  test(kind+": direct newer version cannot overtake offline replay",async()=>{
    const entered=gate(),unblock=gate(),calls=[];
    reset();
    await cloud[method]({id:kind+"-same",name:"older"});
    cloud.registerRemoteWriter({[writerMethod]:async value=>{
      calls.push(value.name);
      if(value.name==="older"){entered.release();await unblock.promise;}
    }},OWNER);
    const retry=cloud.retryScopedMasterOutbox();
    await entered.promise;
    const direct=cloud[method]({id:kind+"-same",name:"newer"});
    assert.deepEqual(calls,["older"],"Newer version cannot race retry");
    assert.deepEqual(statuses(),["pending","pending"]);
    unblock.release();
    const result=await retry;
    await direct;
    assert.equal(result.acknowledged,1);
    assert.deepEqual(calls,["older","newer"]);
    assert.deepEqual(statuses(),["synced","synced"]);
  });
}

test("failed offline replay blocks newer direct revision without losing history",async()=>{
  const entered=gate(),unblock=gate(),calls=[];
  reset();
  await cloud.remoteUpsertCategory({id:"same",name:"older"});
  cloud.registerRemoteWriter({upsertCategory:async data=>{
    calls.push(data.name);
    if(data.name==="older"){entered.release();await unblock.promise;throw Error("offline");}
  }},OWNER);
  const replay=cloud.retryScopedMasterOutbox();
  await entered.promise;
  const direct=cloud.remoteUpsertCategory({id:"same",name:"newer"});
  unblock.release();
  const result=await replay;
  await direct;
  assert.equal(result.failed,1);
  assert.deepEqual(calls,["older"]);
  assert.deepEqual(statuses(),["failed","pending"]);
  cloud.registerRemoteWriter({upsertCategory:async data=>{calls.push(data.name);}},OWNER);
  const recovered=await cloud.retryScopedMasterOutbox();
  assert.equal(recovered.acknowledged,2);
  assert.deepEqual(calls,["older","older","newer"]);
  assert.deepEqual(statuses(),["synced","synced"]);
});

test("unrelated aggregate can upload during blocked offline retry",async()=>{
  const entered=gate(),unblock=gate(),calls=[];
  reset();
  await cloud.remoteUpsertCustomer({id:"slow",name:"older"});
  cloud.registerRemoteWriter({upsertCustomer:async value=>{
    calls.push(value.id);
    if(value.id==="slow"){entered.release();await unblock.promise;}
  }},OWNER);
  const retry=cloud.retryScopedMasterOutbox();
  await entered.promise;
  await cloud.remoteUpsertCustomer({id:"other",name:"independent"});
  assert.deepEqual(calls,["slow","other"]);
  assert.deepEqual(statuses(),["pending","synced"]);
  unblock.release();
  await retry;
  assert.deepEqual(statuses(),["synced","synced"]);
});

test("restored queue and revoked session cannot ACK an old replay or send a queued direct update",async()=>{
  const entered=gate(),unblock=gate(),calls=[];
  reset();
  await cloud.remoteUpsertProduct({id:"restored",name:"old"});
  cloud.registerRemoteWriter({upsertProduct:async p=>{
    calls.push(p.name);
    if(p.name==="old"){entered.release();await unblock.promise;}
  }},OWNER);
  const replay=cloud.retryScopedMasterOutbox();
  await entered.promise;
  const newer=cloud.remoteUpsertProduct({id:"restored",name:"new"});
  const restored=structuredClone(outbox.exportOutbox());
  restored[0].payload.name="restored payload";
  outbox.hydrateOutbox(restored);
  cloud.registerRemoteWriter(null);
  outbox.setOutboxScope(null);
  unblock.release();
  await Promise.all([replay,newer]);
  assert.deepEqual(calls,["old"]);
  assert.deepEqual(statuses(),["pending","pending"]);
  assert.equal(outbox.exportOutbox()[0].payload.name,"restored payload");
});

test("shared aggregate flight is used by both paths and first direct call stays synchronous",async()=>{
  const s=fs.readFileSync("packages/business-logic/src/remote-write.ts","utf8");
  assert.match(s,/const disposition = await runScopedMasterFlight\(event,/);
  assert.match(s,/return runScopedMasterFlight\(event, dispatch\);/);
  reset({upsertCategory:async()=>{}});
  let started=0;
  cloud.registerRemoteWriter({upsertCategory:async()=>{started++;}},OWNER);
  const write=cloud.remoteUpsertCategory({id:"immediate",name:"one"});
  assert.equal(started,1);
  await write;
});
