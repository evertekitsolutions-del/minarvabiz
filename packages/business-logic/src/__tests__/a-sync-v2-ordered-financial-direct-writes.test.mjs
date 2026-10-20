import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url), ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText, filename,
);
const cloud = require("../remote-write.ts");
const outbox = require("../outbox-bridge.ts");
const OWNER_A = "verified-org-a:verified-user-a";
const OWNER_B = "verified-org-b:verified-user-b";

function reset(scope=OWNER_A, writer=null) {
  cloud.registerRemoteWriter(null);
  outbox.hydrateOutbox([]);
  outbox.setOutboxScope(scope);
  if (writer) cloud.registerRemoteWriter(writer,scope);
}
function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return {promise,release};
}
const statuses = () => outbox.exportOutbox().map(x=>x.status);
const sale = (id, sku="same-sku") => ({
  id,items:[{productId:sku,quantity:1}],total:100,
});
const pay = (id, saleId) => ({id,amount:100,referenceType:"sale",referenceId:saleId});

test("two same-device sales never overlap and are acknowledged as complete groups in order", async () => {
  const first=gate(), entered=gate(), calls=[];
  reset(OWNER_A,{createSale:async s=>{
    calls.push(s.id);
    if(s.id==="sale-first"){entered.release();await first.promise;}
  }});
  const a=cloud.remoteCreateSale(sale("sale-first"),[pay("pay-first","sale-first")]);
  assert.deepEqual(calls,["sale-first"],"Original immediate direct-write start contract");
  const b=cloud.remoteCreateSale(sale("sale-next"),[pay("pay-next","sale-next")]);
  await entered.promise;
  assert.deepEqual(calls,["sale-first"],"Second cloud RPC cannot overtake the first");
  assert.deepEqual(statuses(),["pending","pending","pending","pending"]);
  first.release();
  await Promise.all([a,b]);
  assert.deepEqual(calls,["sale-first","sale-next"]);
  assert.deepEqual(statuses(),["synced","synced","synced","synced"]);
});

test("a sale made offline blocks newly connected direct financial writes until grouped replay", async () => {
  reset();
  await cloud.remoteCreateSale(sale("sale-offline"),[pay("pay-offline","sale-offline")]);
  let calls=0;
  cloud.registerRemoteWriter({createSale:async()=>{calls++;}},OWNER_A);
  await cloud.remoteCreateSale(sale("sale-online"),[pay("pay-online","sale-online")]);
  assert.equal(calls,0,"A later sale must not bypass an unacknowledged earlier sale");
  assert.deepEqual(statuses(),["pending","pending","pending","pending"]);
});

test("an earlier failed atomic sale cannot be skipped by a newer successful write", async () => {
  let calls=0;
  const original=console.warn;
  console.warn=()=>{};
  try {
    reset(OWNER_A,{createSale:async()=>{calls++;throw Error("offline connection");}});
    await cloud.remoteCreateSale(sale("sale-failed"),[pay("pay-failed","sale-failed")]);
    await cloud.remoteCreateSale(sale("sale-after"),[pay("pay-after","sale-after")]);
  } finally { console.warn=original; }
  assert.equal(calls,1);
  assert.deepEqual(statuses(),["pending","pending","pending","pending"]);
});

test("a prior sale flag alone cannot bypass unsettled linked payment", async () => {
  reset();
  await cloud.remoteCreateSale(sale("sale-earlier"),[pay("pay-earlier","sale-earlier")],false,{
    schemaVersion:1,branchId:"b",warehouseId:"w",locationId:"l",
    currencyCode:"USD",currencyExponent:2,expectedVersions:{},
    stockLines:[],journalId:"j",
  });
  outbox.exportOutbox()[0].status="synced";
  let calls=0;
  cloud.registerRemoteWriter({createSale:async()=>{calls++;}},OWNER_A);
  await cloud.remoteCreateSale(sale("sale-new"),[pay("pay-new","sale-new")]);
  assert.equal(calls,0);
  assert.deepEqual(statuses(),["synced","pending","pending","pending"]);
});

test("two different authenticated owners are independent; logout never ACKs old sender", async () => {
  const hold=gate(),entered=gate(),calls=[];
  reset(OWNER_A,{createSale:async s=>{calls.push(s.id);entered.release();await hold.promise;}});
  const first=cloud.remoteCreateSale(sale("sale-owner-a"),[pay("pay-a","sale-owner-a")]);
  await entered.promise;
  outbox.setOutboxScope(OWNER_B);
  cloud.registerRemoteWriter({createSale:async s=>{calls.push(s.id);}},OWNER_B);
  await cloud.remoteCreateSale(sale("sale-owner-b"),[pay("pay-b","sale-owner-b")]);
  assert.deepEqual(calls,["sale-owner-a","sale-owner-b"]);
  assert.deepEqual(statuses(),["pending","pending","synced","synced"]);
  hold.release();
  await first;
  assert.deepEqual(statuses(),["pending","pending","synced","synced"]);
});

test("queued financial writer cannot send a changed or restored payment payload", async () => {
  const entered=gate(),resume=gate(),calls=[];
  reset(OWNER_A,{createSale:async s=>{
    calls.push(s.id);
    if(s.id==="sale-block"){entered.release();await resume.promise;}
  }});
  const first=cloud.remoteCreateSale(sale("sale-block"),[pay("pay-block","sale-block")]);
  const second=cloud.remoteCreateSale(sale("sale-restored"),[pay("pay-restored","sale-restored")]);
  await entered.promise;
  const restored=structuredClone(outbox.exportOutbox());
  restored[3].payload.amount=50;
  outbox.hydrateOutbox(restored);
  resume.release();
  await Promise.all([first,second]);
  assert.deepEqual(calls,["sale-block"],"Restored in-flight group cannot be re-sent or falsely ACK'd");
  assert.deepEqual(statuses(),["pending","pending","pending","pending"]);
});

test("dimensional sales use the same ordered gate with no legacy RPC downgrade", async () => {
  const entered=gate(),resume=gate(),calls=[];
  reset(OWNER_A,{
    createDimensionalSale:async s=>{calls.push("dim:"+s.id);if(s.id==="dim-a"){entered.release();await resume.promise;}},
    createSale:async s=>{calls.push("legacy:"+s.id);},
  });
  const dimensional=id=>({
    id,items:[{productId:"stock-a",dimensionMetadata:{length:1,width:1,quantity:1}}],
  });
  const a=cloud.remoteCreateSale(dimensional("dim-a"));
  const b=cloud.remoteCreateSale(dimensional("dim-b"));
  await entered.promise;
  assert.deepEqual(calls,["dim:dim-a"]);
  resume.release();
  await Promise.all([a,b]);
  assert.deepEqual(calls,["dim:dim-a","dim:dim-b"]);
  assert.deepEqual(statuses(),["synced","synced"]);
});
