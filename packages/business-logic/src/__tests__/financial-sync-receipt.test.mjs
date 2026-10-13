import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText, filename,
);
const { validateFinancialReceipt } = require("../financial-sync-envelope.ts");
const { fixture, IDS, scope } = require("./financial-sync-envelope.test.mjs");
const expected = () => ({
  schemaVersion:1, eventId:IDS.saleEvent, organizationId:IDS.org,
  deviceId:IDS.device, branchId:IDS.branch, warehouseId:IDS.warehouse, locationId:IDS.location,
  operation:"sale.post", sequence:14, occurredAt:"2026-10-13T12:00:00.000Z",
  expectedVersions:{[IDS.product]:8}, sale:fixture().sales[0], payments:fixture().payments,
  accounts:fixture().accounting.accounts, journal:fixture().accounting.journals[0],
  stockLines: fixture().outbox[0].financialSyncProof.stockLines,
  currencyCode:"USD",currencyExponent:2, paymentEventIds:[IDS.cashEvent,IDS.cardEvent],
});
const valid = () => ({
  accepted:true,replayed:false,eventId:IDS.saleEvent, organizationId:IDS.org,
  serverCursor:"53",requestDigest:"a".repeat(64),committedAt:"2026-10-13T12:00:01.000Z",
});

test("valid authority reply is not just a boolean; exact identity and committed cursor required", () => {
  const receipt=validateFinancialReceipt(valid(),expected(),scope);
  assert.equal(receipt.eventId,IDS.saleEvent);
  assert.equal(receipt.serverCursor,"53");
  assert.equal(receipt.requestDigest,"a".repeat(64));
});

test("HTTP success with empty, rejected, or arbitrary-shaped response is not an acknowledgement", () => {
  for (const reply of [null,{},true,{accepted:true},{accepted:false,eventId:IDS.saleEvent,code:"stock_conflict"}, "ok"]) {
    assert.throws(()=>validateFinancialReceipt(reply,expected(),scope));
  }
});

test("wrong event, organization, account scope and unsupported cursor are rejected", () => {
  assert.throws(()=>validateFinancialReceipt({...valid(),eventId:IDS.cardEvent},expected(),scope),/event|identity/i);
  assert.throws(()=>validateFinancialReceipt({...valid(),organizationId:"20000000-0000-4000-8000-000000000001"},expected(),scope),/org|scope|identity/i);
  assert.throws(()=>validateFinancialReceipt(valid(),expected(),"not-authorized"),/org|scope|identity/i);
  for (const cursor of ["", "0", "-1", "2.5", "2026-10-13T12:00:01Z", "1e9", null]) {
    assert.throws(()=>validateFinancialReceipt({...valid(),serverCursor:cursor},expected(),scope),/cursor/i);
  }
});

test("a missing or malformed server digest and timestamp must never mark the outbox synced", () => {
  for (const digest of [null,"", "abc","A".repeat(64),"g".repeat(64)]) {
    assert.throws(()=>validateFinancialReceipt({...valid(),requestDigest:digest},expected(),scope),/digest/i);
  }
  for (const committedAt of ["",null,"not-a-timestamp","2026-10-13",new Date(0).toISOString()]) {
    assert.throws(()=>validateFinancialReceipt({...valid(),committedAt},expected(),scope),/committed|timestamp/i);
  }
});

test("replayed receipts may be accepted but client-declared digest is never treated as signature", () => {
  const receipt=validateFinancialReceipt({...valid(),replayed:true},expected(),scope);
  assert.equal(receipt.replayed,true);
  assert.equal(Object.keys(receipt).includes("signed"),false);
});
