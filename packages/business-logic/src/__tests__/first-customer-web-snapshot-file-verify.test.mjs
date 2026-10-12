import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,filename)=>mod._compile(ts.transpileModule(
  fs.readFileSync(filename,"utf8"),
  {fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}
).outputText,filename);

const {
  inspectBrowserSnapshotForRecovery,
  MAX_BROWSER_SNAPSHOT_VERIFY_BYTES
}=require("../browser-snapshot-download.ts");

const mandatory=[
  "customers","products","categories","sales","payments","orders",
  "measurements","laundry","expenses","purchases","suppliers",
  "expenseCategories","staff","assignments","incentiveRules","payouts",
  "notifications","returns","audit","branches"
];
const build=()=>({
  version:15,exportedAt:"2026-10-12T04:00:00.000Z",
  ...Object.fromEntries(mandatory.map(k=>[k,[]])),
  accounting:{accounts:[{id:"journal-account"}]},
  warehouse:{warehouses:[{id:"wh"}],locations:[]},
  procurement:{purchaseOrders:[]},outbox:[],
});
const inspect=(input,bytes)=>{const json=typeof input==="string"?input:JSON.stringify(input);return inspectBrowserSnapshotForRecovery(json,15,bytes??Buffer.byteLength(json));};

test("Verifies a full local snapshot without changing its source data",()=>{
  const snapshot=build();snapshot.customers.push({id:"c1"});snapshot.sales.push({id:"sale1"});
  const frozen=JSON.stringify(snapshot);
  const reviewed=inspect(snapshot);
  assert.equal(reviewed.version,15);
  assert.equal(reviewed.exportedAt,snapshot.exportedAt);
  assert.equal(reviewed.recordCounts.customers,1);
  assert.equal(reviewed.recordCounts.sales,1);
  assert.equal(reviewed.recordCounts.branches,0);
  assert.equal(reviewed.sections.accounting,true);
  assert.equal(reviewed.sections.warehouse,true);
  assert.equal(reviewed.sections.procurement,true);
  assert.equal(reviewed.sections.outbox,true);
  assert.equal(reviewed.sections.shopProfile,false);
  assert.equal(JSON.stringify(snapshot),frozen,"Read-only inspection must never edit downloaded records");
});

test("Fail closed on partial archive, malformed JSON, unsupported version and bad timestamp",()=>{
  const snap=build();
  for(const missing of mandatory){
    const data={...snap};delete data[missing];
    assert.throws(()=>inspect(data),/Incomplete business snapshot/);
  }
  for(const text of ["","{broken","[]","null"]){
    assert.throws(()=>inspect(text),/JSON|business snapshot/i);
  }
  assert.throws(()=>inspect({...snap,version:14}),/version mismatch/);
  assert.throws(()=>inspect({...snap,exportedAt:"not-a-date"}),/timestamp/);
});

test("Rejects oversized, empty and invalid byte lengths before reading dangerous files",()=>{
  const snap=build();
  for(const invalid of [0,-1,MAX_BROWSER_SNAPSHOT_VERIFY_BYTES+1,1.5,NaN,Infinity]){
    assert.throws(()=>inspect(snap,invalid),/128 MiB|invalid/);
  }
  assert.ok(MAX_BROWSER_SNAPSHOT_VERIFY_BYTES>=64*1024*1024);
});

test("Web verification requires backup permission and never invokes cloud write/restore",()=>{
  const page=fs.readFileSync("apps/web/src/app/(app)/backup/page.tsx","utf8");
  assert.match(page,/inspectBrowserSnapshotForRecovery\(text, SNAPSHOT_VERSION, file\.size\)/);
  assert.match(page,/validateDomainSnapshot\(JSON\.parse\(text\)\)/);
  assert.match(page,/can\("backup\.manage"\)/);
  assert.match(page,/setVerifiedSnapshot\(inspection\)/);
  assert.match(page,/This is not a verified restore/);
  assert.match(page,/No data was restored or uploaded/);
  assert.doesNotMatch(page,/importDomainSnapshotJson\(|importDomainSnapshot\(|supabase\.from\(|\.upsert\(/);
});
