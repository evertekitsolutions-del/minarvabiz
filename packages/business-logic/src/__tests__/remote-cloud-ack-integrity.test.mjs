import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename,"utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename,
);
const outbox = require("../outbox-bridge.ts");
const remote = require("../remote-write.ts");

function reset(writer = null) {
  remote.registerRemoteWriter(null);
  outbox.hydrateOutbox([]);
  outbox.setOutboxScope("org-test:user-test");
  if (writer) remote.registerRemoteWriter(writer, "org-test:user-test");
}
function events() {
  return outbox.exportOutbox().map(({ aggregateType, id, status }) => ({ aggregateType, id, status }));
}
function deferred() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

test("ack only successful authenticated customer/category/product writes, persist acknowledgements", async () => {
  const calls = [];
  reset({
    upsertCustomer: async c => { calls.push("customer:" + c.id); },
    upsertCategory: async c => { calls.push("category:" + c.id); },
    upsertProduct: async p => { calls.push("product:" + p.id); },
  });
  await remote.remoteUpsertCustomer({ id:"customer-1", name:"Offline customer" });
  await remote.remoteUpsertCategory({ id:"category-1", name:"Materials" });
  await remote.remoteUpsertProduct({ id:"product-1", name:"Fabric" });
  assert.deepEqual(calls,["customer:customer-1","category:category-1","product:product-1"]);
  assert.deepEqual(events().map(e => [e.aggregateType,e.status]),[
    ["customers","synced"],["categories","synced"],["products","synced"]
  ]);
  const snapshot = structuredClone(outbox.exportOutbox());
  outbox.hydrateOutbox([]);
  assert.deepEqual(events(),[]);
  outbox.hydrateOutbox(snapshot);
  assert.deepEqual(outbox.exportOutbox(),snapshot,"ack state must survive customer snapshot restore");
});

test("atomic sale with multiple payment lines acknowledges all events only after commit", async () => {
  const gate = deferred();
  let performed=0;
  reset({ createSale: async (sale, payments, negative) => {
    performed++;
    assert.equal(sale.id,"sale-1");
    assert.equal(payments.length,2);
    assert.equal(negative,false);
    await gate.promise;
  }});
  const sending=remote.remoteCreateSale(
    {id:"sale-1", total:150},
    [{id:"cash-1", amount:100}, {id:"card-1", amount:50}],
  );
  assert.equal(performed,1);
  assert.deepEqual(events().map(e=>e.status),["pending","pending","pending"]);
  gate.release();
  await sending;
  assert.deepEqual(events().map(e=>e.status),["synced","synced","synced"]);
  assert.deepEqual(events().map(e=>e.aggregateType),["sales","payments","payments"]);
});

test("offline and missing writer methods keep every event pending", async () => {
  reset();
  await remote.remoteUpsertCustomer({id:"offline-customer"});
  assert.deepEqual(events().map(e=>e.status),["pending"]);
  remote.registerRemoteWriter({});
  await remote.remoteUpsertProduct({id:"no-product-endpoint"});
  assert.deepEqual(events().map(e=>e.status),["pending","pending"]);
});

test("failed cloud request never acknowledges customer or financial sale", async () => {
  reset({
    upsertCustomer: async () => { throw Error("RLS rejection"); },
    createSale: async () => { throw Error("transaction rolled back"); },
  });
  const previous=console.warn;
  console.warn=()=>{};
  try {
    await remote.remoteUpsertCustomer({id:"failed-customer"});
    await remote.remoteCreateSale({id:"failed-sale"},[{id:"failed-payment"}]);
  } finally { console.warn=previous; }
  assert.deepEqual(events().map(e=>e.status),["pending","pending","pending"]);
});

test("logout/tenant switch during an async cloud write never acknowledges its old session", async () => {
  const gate=deferred();
  reset({upsertCustomer:async()=>{await gate.promise;}});
  const currentGeneration=remote.getRemoteWriterGeneration();
  const sending=remote.remoteUpsertCustomer({id:"old-tenant-customer"});
  assert.equal(events()[0].status,"pending");
  remote.registerRemoteWriter(null);
  assert.ok(remote.getRemoteWriterGeneration()>currentGeneration);
  gate.release();
  await sending;
  assert.deepEqual(events().map(e=>e.status),["pending"],
    "old-tenant acknowledgements must not be attributed to the new authentication session");
});


test("dimensional sale stays visible as failed durable outbox until atomic cloud RPC supports metadata", async () => {
  let cloudAttempts=0;
  reset({createSale:async()=>{cloudAttempts++;}});
  const sale={
    id:"dimension-sale-1",
    items:[{id:"dimension-item-1",quantity:3,dimensionMetadata:{
      schema:"dimension-line-v1",algorithm:"area-v1",length:"12",width:"18",
      lengthUnit:"in",widthUnit:"in",billableUnit:"sqft",pieces:2,quantityMilli:3000,
    }}],
  };
  await remote.remoteCreateSale(sale,[{id:"dimension-payment-1",amount:300}]);
  assert.equal(cloudAttempts,0,"older RPC silently discards dimension_metadata");
  const queued=outbox.exportOutbox();
  assert.deepEqual(queued.map(e=>e.status),["failed","failed"]);
  assert.ok(queued.every(e=>/dimension.*not supported|dimension.*unsupported/i.test(e.lastError)));
  assert.deepEqual(queued[0].payload.items[0].dimensionMetadata,sale.items[0].dimensionMetadata);
});
