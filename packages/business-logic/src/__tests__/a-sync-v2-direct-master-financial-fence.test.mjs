import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url), ts=require("typescript");
require.extensions[".ts"] = (mod,filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename,"utf8"),{
    fileName:filename,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText,filename,
);
const cloud=require("../remote-write.ts");
const outbox=require("../outbox-bridge.ts");
const A="verified-a:user-a",B="verified-b:user-b";

function reset(scope=A,writer=null) {
  cloud.registerRemoteWriter(null);
  outbox.hydrateOutbox([]);
  outbox.setOutboxScope(scope);
  if (writer) cloud.registerRemoteWriter(writer,scope);
}
function deferred() {
  let release;
  const promise=new Promise(resolve=>{release=resolve});
  return {promise,release};
}
const queue=()=>outbox.exportOutbox();

test("online direct customer/product upserts stay pending behind offline sale and receipt", async()=>{
  reset();
  await cloud.remoteCreateSale({id:"offline-sale"},[{id:"offline-payment"}]);
  const calls=[];
  cloud.registerRemoteWriter({
    upsertCustomer:async c=>{calls.push("customer:"+c.id);},
    upsertProduct:async p=>{calls.push("product:"+p.id);},
    upsertCategory:async c=>{calls.push("category:"+c.id);},
  },A);
  await cloud.remoteUpsertCustomer({id:"balance-owner",balance:100});
  await cloud.remoteUpsertProduct({id:"stock-item",stockQuantity:12});
  await cloud.remoteUpsertCategory({id:"independent-category",name:"Materials"});
  assert.deepEqual(calls,["category:independent-category"]);
  assert.deepEqual(queue().map(e=>e.status),["pending","pending","pending","pending","synced"]);
  assert.equal(cloud.getScopedMasterReplayStatus().blocked,4);
  assert.equal((await cloud.retryScopedMasterOutbox()).acknowledged,0,
    "Retry and direct writes must use the same transaction boundary");
  const [sale,payment]=queue();
  outbox.markOutboxSynced([sale.id,payment.id]);
  const retry=await cloud.retryScopedMasterOutbox();
  assert.equal(retry.acknowledged,2);
  assert.deepEqual(calls,[
    "category:independent-category","customer:balance-owner","product:stock-item",
  ]);
  assert.ok(queue().every(e=>e.status==="synced"));
});

test("acknowledging a sale alone does not release direct master updates while its payment is pending",async()=>{
  reset();
  await cloud.remoteCreateSale({id:"partial-sale"},[{id:"partial-tender"}]);
  outbox.markOutboxSynced([queue()[0].id]);
  const calls=[];
  cloud.registerRemoteWriter({
    upsertCustomer:async ()=>calls.push("customer"),
    upsertProduct:async ()=>calls.push("product"),
  },A);
  await cloud.remoteUpsertCustomer({id:"buyer"});
  await cloud.remoteUpsertProduct({id:"sku"});
  assert.deepEqual(calls,[]);
  assert.deepEqual(queue().map(e=>e.status),["synced","pending","pending","pending"]);
  assert.equal(cloud.getScopedMasterReplayStatus().ready,0);
  outbox.markOutboxSynced([queue()[1].id]);
  assert.equal((await cloud.retryScopedMasterOutbox()).acknowledged,2);
  assert.deepEqual(calls,["customer","product"]);
});

test("failed transaction also freezes online customer/product upserts until reconciled",async()=>{
  reset();
  const tx=outbox.enqueueOutbox("expenses","cash-out-1","insert",{id:"cash-out-1"});
  outbox.markOutboxFailed(tx.id,"cloud unavailable");
  let called=0;
  cloud.registerRemoteWriter({
    upsertCustomer:async()=>{called++},
    upsertProduct:async()=>{called++},
  },A);
  await cloud.remoteUpsertCustomer({id:"c-1"});
  await cloud.remoteUpsertProduct({id:"p-1"});
  assert.equal(called,0);
  assert.deepEqual(queue().map(e=>e.status),["failed","pending","pending"]);
  outbox.markOutboxSynced([tx.id]);
  assert.equal((await cloud.retryScopedMasterOutbox()).acknowledged,2);
  assert.equal(called,2);
});

test("a transaction from another tenant does not freeze the active verified owner",async()=>{
  reset(A);
  await cloud.remoteCreateSale({id:"private-a"},[{id:"private-a-payment"}]);
  outbox.setOutboxScope(B);
  const calls=[];
  cloud.registerRemoteWriter({
    upsertCustomer:async()=>calls.push("customer-b"),
    upsertProduct:async()=>calls.push("product-b"),
  },B);
  await cloud.remoteUpsertCustomer({id:"b-customer"});
  await cloud.remoteUpsertProduct({id:"b-product"});
  assert.deepEqual(calls,["customer-b","product-b"]);
  assert.deepEqual(queue().map(e=>e.status),["pending","pending","synced","synced"]);
  assert.deepEqual(cloud.getScopedMasterReplayStatus(),{
    available:true,pending:0,ready:0,blocked:0,
  });
});

test("a transaction added while first same-record master write is in flight holds queued revision",async()=>{
  const started=deferred(),release=deferred(),calls=[];
  reset(A,{
    upsertCustomer:async customer=>{
      calls.push(customer.name);
      if(customer.name==="first"){started.release();await release.promise;}
    },
  });
  const first=cloud.remoteUpsertCustomer({id:"same-customer",name:"first"});
  await started.promise;
  await cloud.remoteCreateSale({id:"offline-sale"},[{id:"offline-receipt"}]);
  const second=cloud.remoteUpsertCustomer({id:"same-customer",name:"later"});
  release.release();
  await Promise.all([first,second]);
  assert.deepEqual(calls,["first"],"Newer direct upsert must not leapfrog transaction");
  assert.deepEqual(queue().map(e=>e.status),["synced","pending","pending","pending"]);
});

test("source gates both live dispatch and retry using the same outstanding transaction classifier",()=>{
  const source=fs.readFileSync("packages/business-logic/src/remote-write.ts","utf8");
  assert.match(source,/const transactionsOutstanding = active\.some\(isUnsettledScopedTransaction\)/);
  assert.match(source,/event\.aggregateType !== "categories" &&\s+hasUnsettledScopedTransaction\(event\.ownerScope\)/);
});
