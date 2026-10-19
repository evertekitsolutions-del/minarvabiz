import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"),{
    fileName:file,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText,file,
);
const { buildSaleFinancialEnvelope } = require("../financial-sync-envelope.ts");
const { fixture, IDS, scope } = await import("./financial-sync-envelope.test.mjs");
const extraId = "10000000-0000-4000-8000-000000000054";
const secondId = "10000000-0000-4000-8000-000000000055";
const otherDevice = "10000000-0000-4000-8000-000000000056";
const otherOrg = "10000000-0000-4000-8000-000000000057";
const otherUser = "10000000-0000-4000-8000-000000000058";

function review(snapshot) {
  const before = structuredClone(snapshot);
  const result = buildSaleFinancialEnvelope(snapshot,IDS.saleEvent,scope);
  assert.deepEqual(snapshot,before,"read-only projection must preserve outbox and customer data");
  return result;
}

test("a valid sale with two separately sequenced split payments remains eligible", () => {
  const result = review(fixture());
  assert.equal(result.operation,"sale.post",JSON.stringify(result));
  assert.deepEqual(result.paymentEventIds,[IDS.cashEvent,IDS.cardEvent]);
});

test("different insert event IDs for one sale cannot each post the same invoice", () => {
  for (const status of ["pending","failed","synced","discarded"]) {
    const snapshot = fixture();
    const duplicate = structuredClone(snapshot.outbox[0]);
    duplicate.id = extraId;
    duplicate.sequence = 17;
    duplicate.status = status;
    snapshot.outbox.push(duplicate);
    const result = review(snapshot);
    assert.equal(result.held,"duplicate_sale_insert_identity",
      "Duplicate financial insert must be held even if another copy is "+status);
    assert.ok(snapshot.outbox.slice(0,3).every(e => e.status==="pending"));
  }
});

test("new payment insert ID referring to a receipt already in the group is rejected", () => {
  for (const status of ["pending","synced"]) {
    const snapshot = fixture();
    const duplicate = structuredClone(snapshot.outbox[1]);
    duplicate.id = extraId;
    duplicate.sequence = 17;
    duplicate.status = status;
    snapshot.outbox.push(duplicate);
    assert.equal(review(snapshot).held,"duplicate_payment_insert_identity");
  }
});

test("two proof event IDs cannot refer to the same cash receipt", () => {
  const snapshot = fixture();
  snapshot.outbox[2].aggregateId = IDS.cash;
  snapshot.outbox[2].payload = structuredClone(snapshot.payments[0]);
  assert.equal(review(snapshot).held,"duplicate_payment_insert_identity");
});

test("reused device sequence within a sale/payment bundle cannot mint an envelope", () => {
  const snapshot = fixture();
  snapshot.outbox[2].sequence = snapshot.outbox[0].sequence;
  assert.equal(review(snapshot).held,"duplicate_device_event_sequence");
});

test("reused same-device sequence from an unrelated event is held too", () => {
  const snapshot = fixture();
  snapshot.outbox.push({
    id:extraId,aggregateType:"products",aggregateId:secondId,eventType:"update",
    payload:{id:secondId},ownerScope:scope,deviceId:IDS.device,
    sequence:15,occurredAt:snapshot.outbox[0].occurredAt,status:"synced",
    attempts:0,lastError:null,
  });
  assert.equal(review(snapshot).held,"duplicate_device_event_sequence");
});

test("events from a different device or tenant do not cause false sequence collisions", () => {
  const snapshot = fixture();
  for (const [id,deviceId,ownerScope] of [
    [extraId,otherDevice,scope],
    [secondId,IDS.device,otherOrg+":"+otherUser],
  ]) {
    snapshot.outbox.push({
      id,aggregateType:"products",aggregateId:id,eventType:"update",
      payload:{id},ownerScope,deviceId,sequence:14,
      occurredAt:snapshot.outbox[0].occurredAt,status:"pending",
      attempts:0,lastError:null,
    });
  }
  assert.equal(review(snapshot).operation,"sale.post");
});

test("corrupt local per-device sequence cannot pass financial projection", () => {
  for (const sequence of [0,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]) {
    const snapshot=fixture();
    snapshot.outbox[1].sequence=sequence;
    assert.equal(review(snapshot).held,"duplicate_device_event_sequence");
  }
});

test("all duplicate-identity defenses execute before financial sale envelope allocation", () => {
  const src=fs.readFileSync("packages/business-logic/src/financial-sync-envelope.ts","utf8");
  const saleGuard=src.indexOf("duplicate_sale_insert_identity");
  const sequenceGuard=src.indexOf("duplicate_device_event_sequence");
  const paymentGuard=src.indexOf("duplicate_payment_insert_identity");
  const produce=src.indexOf("const result: FinancialSyncEnvelopeV1");
  assert.ok(saleGuard>0 && sequenceGuard>saleGuard && paymentGuard>sequenceGuard && produce>paymentGuard);
});
