import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{
  fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,filename);
const outbox=require("../outbox-bridge.ts");
const remote=require("../remote-write.ts");
const proof={
  schemaVersion:1,branchId:"10000000-0000-4000-8000-000000000003",
  warehouseId:"10000000-0000-4000-8000-000000000004",
  locationId:"10000000-0000-4000-8000-000000000005",
  currencyCode:"USD",currencyExponent:2,
  expectedVersions:{"10000000-0000-4000-8000-000000000007":8},
  stockLines:[],
  journalId:"10000000-0000-4000-8000-000000000014",
};
test("sale outbox captures immutable sale group identity and proof across hydrate", async ()=>{
  remote.registerRemoteWriter(null);
  outbox.hydrateOutbox([]);
  outbox.setOutboxScope("10000000-0000-4000-8000-000000000001:10000000-0000-4000-8000-000000000002");
  const one={id:"10000000-0000-4000-8000-000000000008",items:[]};
  const tender=[{id:"10000000-0000-4000-8000-000000000009"},{id:"10000000-0000-4000-8000-000000000010"}];
  await remote.remoteCreateSale(one,tender,false,proof);
  const events=outbox.exportOutbox();
  assert.equal(events.length,3);
  assert.equal(events[0].financialSyncProof.journalId,proof.journalId);
  assert.deepEqual(events[0].financialSyncProof.paymentEventIds,events.slice(1).map(e=>e.id));
  assert.equal(events[0].ownerScope,outbox.getOutboxScope());
  const frozen=structuredClone(events);
  outbox.hydrateOutbox(frozen);
  assert.deepEqual(outbox.exportOutbox()[0].financialSyncProof.paymentEventIds,frozen.slice(1).map(e=>e.id));
  assert.deepEqual(proof,{...proof},"source proof must not mutate");
});

test("legacy sale without proven stock authority remains pending and without attached proof",async()=>{
  remote.registerRemoteWriter(null);
  outbox.hydrateOutbox([]);
  await remote.remoteCreateSale({id:"10000000-0000-4000-8000-000000000008"},[],false);
  assert.equal(outbox.exportOutbox()[0].financialSyncProof,undefined);
  assert.equal(outbox.exportOutbox()[0].status,"pending");
});
