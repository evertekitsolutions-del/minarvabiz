import test from "node:test";
import assert from "node:assert/strict";
import {
  FinancialEnvelopeDeduplicator,
  FINANCIAL_SYNC_EVENT_TYPES,
  FINANCIAL_SYNC_SCHEMA_VERSION,
  validateFinancialSyncEnvelope,
} from "../financial-envelope.ts";

const valid=(overrides={})=>({
  schemaVersion:FINANCIAL_SYNC_SCHEMA_VERSION,eventId:"event-1",
  idempotencyKey:"cashier-01:receipt-1001",tenantId:"tenant-1",companyId:"company-1",
  branchId:"branch-1",deviceId:"device-1",aggregateType:"sale",aggregateId:"sale-1001",
  eventType:"sale.posted",currency:"INR",occurredAt:"2026-10-26T05:00:00.000Z",
  payload:{totalMinor:12500,lines:[{sku:"CAM-01",quantityMilli:1000}]},...overrides
});

test("exports the schema and the supported financial event catalogue",()=>{
  assert.equal(FINANCIAL_SYNC_SCHEMA_VERSION,1);
  assert.ok(FINANCIAL_SYNC_EVENT_TYPES.includes("sale.posted"));
  assert.equal(FINANCIAL_SYNC_EVENT_TYPES.length,6);
});

test("accepts a scoped financial envelope and isolates its top-level copy",()=>{
  const input=valid();const result=validateFinancialSyncEnvelope(input);
  assert.equal(result.ok,true);
  if(result.ok){assert.equal(result.envelope.tenantId,"tenant-1");assert.equal(result.envelope.branchId,"branch-1");assert.notEqual(result.envelope,input);assert.equal(result.envelope.payload.totalMinor,12500);}
});

test("rejects null, arrays, primitives and non-plain envelope objects",()=>{
  for(const value of [null,[],42,"event",new Date()])assert.equal(validateFinancialSyncEnvelope(value).ok,false);
  const nullPrototype=Object.assign(Object.create(null),valid());
  assert.equal(validateFinancialSyncEnvelope(nullPrototype).ok,true);
});

test("rejects each missing or overlong identity field",()=>{
  for(const field of ["eventId","idempotencyKey","tenantId","companyId","branchId","deviceId","aggregateType","aggregateId"]){
    assert.equal(validateFinancialSyncEnvelope(valid({[field]:"  "})).ok,false,field+" blank");
    assert.equal(validateFinancialSyncEnvelope(valid({[field]:"x".repeat(201)})).ok,false,field+" too long");
  }
});

test("rejects unsupported schema and unknown event types",()=>{
  assert.equal(validateFinancialSyncEnvelope(valid({schemaVersion:2})).ok,false);
  assert.equal(validateFinancialSyncEnvelope(valid({eventType:"money.magic"})).ok,false);
});

test("rejects malformed currencies and canonical UTC timestamps",()=>{
  for(const currency of ["rupees","in","inr",123,null])assert.equal(validateFinancialSyncEnvelope(valid({currency})).ok,false);
  for(const occurredAt of ["2026-10-26","2026-02-30T05:00:00.000Z","2026-10-26T05:00:00Z",null])assert.equal(validateFinancialSyncEnvelope(valid({occurredAt})).ok,false);
  assert.equal(validateFinancialSyncEnvelope(valid({occurredAt:"2026-10-26T05:00:00.000Z"})).ok,true);
});

test("rejects non-object payloads and JSON-unsafe nested values",()=>{
  for(const payload of [null,[],new Date(), "text", 12])assert.equal(validateFinancialSyncEnvelope(valid({payload})).ok,false);
  for(const bad of [undefined,NaN,Infinity,()=>{},Symbol("x"),1n]){
    assert.equal(validateFinancialSyncEnvelope(valid({payload:{bad}})).ok,false);
  }
  const cyclic={};cyclic.self=cyclic;
  assert.equal(validateFinancialSyncEnvelope(valid({payload:cyclic})).ok,false);
  const sparse=[];sparse.length=1;
  assert.equal(validateFinancialSyncEnvelope(valid({payload:{items:sparse}})).ok,false);
});

test("accepts JSON-safe null, booleans, strings, finite numbers and nested arrays",()=>{
  const result=validateFinancialSyncEnvelope(valid({payload:{nothing:null,enabled:true,name:"cam",amount:0,nested:[1,"two",false,null,{ok:true}]}}));
  assert.equal(result.ok,true);
});

test("deduplicator returns invalid without mutating its state",()=>{
  const d=new FinancialEnvelopeDeduplicator();
  assert.equal(d.accept({schemaVersion:999}).status,"invalid");
  assert.equal(d.size,0);
});

test("same key and command is duplicate despite new event ID/time and object key order",()=>{
  const d=new FinancialEnvelopeDeduplicator();assert.equal(d.accept(valid()).status,"accepted");
  const retry=valid({eventId:"event-retry",occurredAt:"2026-10-26T05:01:00.000Z",payload:{lines:[{quantityMilli:1000,sku:"CAM-01"}],totalMinor:12500}});
  const result=d.accept(retry);assert.equal(result.status,"duplicate");
  if(result.status==="duplicate")assert.equal(result.originalEventId,"event-1");
  assert.equal(d.size,1);
});

test("same key with a different command fails closed",()=>{
  const d=new FinancialEnvelopeDeduplicator();d.accept(valid());
  const result=d.accept(valid({payload:{totalMinor:12501}}));
  assert.equal(result.status,"idempotency-conflict");assert.equal(d.size,1);
});

test("same idempotency key is isolated by tenant",()=>{
  const d=new FinancialEnvelopeDeduplicator();
  assert.equal(d.accept(valid()).status,"accepted");
  assert.equal(d.accept(valid({tenantId:"tenant-2"})).status,"accepted");
  assert.equal(d.size,2);
});

test("clear resets the in-process idempotency map",()=>{
  const d=new FinancialEnvelopeDeduplicator();d.accept(valid());assert.equal(d.size,1);
  d.clear();assert.equal(d.size,0);assert.equal(d.accept(valid()).status,"accepted");
});

test("validated envelopes deep-clone nested payloads",()=>{
  const input=valid();const originalSku=input.payload.lines[0].sku;
  const result=validateFinancialSyncEnvelope(input);
  assert.equal(result.ok,true);
  if(result.ok){
    input.payload.lines[0].sku="MUTATED-INPUT";
    assert.equal(result.envelope.payload.lines[0].sku,originalSku);
    result.envelope.payload.lines[0].sku="MUTATED-OUTPUT";
    assert.equal(input.payload.lines[0].sku,"MUTATED-INPUT");
  }
});


test("validates every supported event type and rejects malformed required field types",()=>{
  for(const eventType of FINANCIAL_SYNC_EVENT_TYPES)assert.equal(validateFinancialSyncEnvelope(valid({eventType})).ok,true,eventType);
  for(const field of ["eventId","idempotencyKey","tenantId","companyId","branchId","deviceId","aggregateType","aggregateId"]){
    for(const value of [null,0,{},[]])assert.equal(validateFinancialSyncEnvelope(valid({[field]:value})).ok,false,field+" type");
  }
  assert.equal(validateFinancialSyncEnvelope(valid({schemaVersion:null})).ok,false);
  assert.equal(validateFinancialSyncEnvelope(valid({currency:"US1"})).ok,false);
});

test("rejects noncanonical and impossible timestamps and non-plain nested payload objects",()=>{
  for(const occurredAt of [
    "2026-10-26T05:00:00.000+00:00",
    "2026-10-26T05:00:00.001Z ",
    "2026-13-26T05:00:00.000Z",
    "2026-10-26T25:00:00.000Z"
  ])assert.equal(validateFinancialSyncEnvelope(valid({occurredAt})).ok,false,occurredAt);
  assert.equal(validateFinancialSyncEnvelope(valid({payload:{nested:new Date()}})).ok,false);
  assert.equal(validateFinancialSyncEnvelope(valid({payload:{nested:Object.create({inherited:"no"})}})).ok,false);
});

test("rejects cyclic arrays and preserves tenant-scoped command identity",()=>{
  const cycle=[];cycle.push(cycle);
  assert.equal(validateFinancialSyncEnvelope(valid({payload:{cycle}})).ok,false);
  const d=new FinancialEnvelopeDeduplicator();
  assert.equal(d.accept(valid()).status,"accepted");
  for(const changed of [
    {companyId:"company-2"},
    {branchId:"branch-2"},
    {deviceId:"device-2"},
    {aggregateType:"refund"},
    {aggregateId:"sale-2"},
    {eventType:"payment.recorded"},
    {currency:"USD"}
  ])assert.equal(d.accept(valid(changed)).status,"idempotency-conflict");
  assert.equal(d.size,1);
});

test("deduplicator can be reused after clear and returns stable conflict details",()=>{
  const d=new FinancialEnvelopeDeduplicator();
  d.accept(valid());
  const conflict=d.accept(valid({payload:{totalMinor:1}}));
  assert.equal(conflict.status,"idempotency-conflict");
  if(conflict.status==="idempotency-conflict"){
    assert.equal(conflict.originalEventId,"event-1");
    assert.match(conflict.error,/different financial command/);
  }
  d.clear();
  const accepted=d.accept(valid({eventId:"event-after-clear"}));
  assert.equal(accepted.status,"accepted");
  if(accepted.status==="accepted")assert.equal(accepted.envelope.eventId,"event-after-clear");
});


test("exports the financial envelope contract from the sync package barrel", async () => {
  const sync = await import("../index.ts");
  assert.equal(sync.FINANCIAL_SYNC_SCHEMA_VERSION, FINANCIAL_SYNC_SCHEMA_VERSION);
  assert.equal(typeof sync.validateFinancialSyncEnvelope, "function");
  assert.equal(typeof sync.FinancialEnvelopeDeduplicator, "function");
});
