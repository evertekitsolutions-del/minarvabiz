import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { generateKeyPairSync, sign, webcrypto } from "node:crypto";

const require=createRequire(import.meta.url),ts=require("typescript");
const Module=require("node:module");
require.extensions[".ts"]=(module,file)=>module._compile(ts.transpileModule(
 fs.readFileSync(file,"utf8"),{fileName:file,compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
  esModuleInterop:true
 }}).outputText,file);
const verifier=require("../holiday-device-receipt.ts");
const cache=require("../holiday-cache.ts");
const stagePath=path.resolve("apps/desktop/src/lib/hr005-signed-receipt-staging.ts");
const source=fs.readFileSync(stagePath,"utf8");
const mod=new Module(stagePath);
mod.filename=stagePath;mod.paths=Module._nodeModulePaths(path.dirname(stagePath));
mod.require=id=>id==="@minarvabiz/business-logic"?
  {holidayDeviceReceipt:verifier}:require(id);
mod._compile(ts.transpileModule(source,{fileName:stagePath,compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
 esModuleInterop:true
}}).outputText,stagePath);
const {stageVerifiedHolidayReceipt}=mod.exports;
const initSqlJs=require("sql.js");
const SQL=await initSqlJs();
const folder=fs.mkdtempSync(path.join(os.tmpdir(),"minarva-receipt-"));
const dbFile=path.join(folder,"staging.sqlite");
const open=(binary=null)=>{
 const db=binary?new SQL.Database(binary):new SQL.Database();
 db.run("PRAGMA foreign_keys=ON");
 const query=(sql,params=[])=>{
  const s=db.prepare(sql);s.bind(params);const rows=[];
  while(s.step())rows.push(s.getAsObject());s.free();return rows;
 };
 const sqlite={
  exec:(sql,params=[])=>db.run(sql,params),
  query,
  transaction:(fn)=>{db.run("BEGIN IMMEDIATE");try{
   const v=fn();db.run("COMMIT");return v;
  }catch(e){db.run("ROLLBACK");throw e;}}
 };
 return {db,sqlite,query};
};
const org="10000000-0000-4000-8000-000000000001";
const foreignOrg="20000000-0000-4000-8000-000000000002";
const device="a0000000-0000-4000-8000-000000000001";
const now=Date.UTC(2026,9,12,12,0,0);
const rule={
 id:"a5000000-0000-4000-8000-000000000001",
 orgId:org,scope:"organization",countryCode:null,branchId:null,
 date:"2026-10-12",repeatsAnnually:false,name:"Approved company review",
 treatment:"informational",active:true,version:1
};
const pair=generateKeyPairSync("ed25519");
const key=new Uint8Array(pair.publicKey.export({type:"spki",format:"der"}).subarray(-32));
const payload={
 schemaVersion:1,snapshotId:"c0000000-0000-4000-8000-000000000001",
 orgId:org,deviceId:device,sequence:7,
 issuedAt:now-1000,expiresAt:now+60_000,rules:[rule]
};
const signed=p=>({payload:structuredClone(p),signatureBase64:sign(null,
 Buffer.from(verifier.holidayDeviceSnapshotSigningBytes(p)),pair.privateKey).toString("base64")});
const trust={expectedOrgId:org,expectedDeviceId:device,
 lastAcceptedSequence:6,nowMs:now,pinnedEd25519PublicKey:key,subtle:webcrypto.subtle};
let {db,sqlite,query}=open();
const beforeCache=structuredClone(cache.exportHolidayCache());
const input={...trust,packet:signed(payload)};
const staged=await stageVerifiedHolidayReceipt(sqlite,input);
assert.deepEqual(staged,{
 snapshotId:payload.snapshotId,orgId:org,deviceId:device,
 stagedSequence:7,canHydrate:false});
assert.deepEqual(cache.exportHolidayCache(),beforeCache,
 "Staging MUST NOT hydrate or rewrite business data cache");
assert.deepEqual(input.packet.payload,payload,"Staging never changes signed input");
assert.equal(query("SELECT COUNT(*) AS n FROM hr005_signed_receipt_staging")[0].n,1);
assert.match(query("SELECT fingerprint_sha256 FROM hr005_signed_receipt_staging")[0].fingerprint_sha256,/^[0-9a-f]{64}$/);
assert.deepEqual(Object.keys(query("SELECT * FROM hr005_signed_receipt_staging")[0]).sort(),
 ["device_id","expires_at","fingerprint_sha256","org_id","sequence","snapshot_id","staged_at"],
 "Only receipt metadata/fingerprint, never customer holiday rules");
await assert.rejects(stageVerifiedHolidayReceipt(sqlite,input),/replay|downgrade/i);
assert.equal(query("SELECT COUNT(*) AS n FROM hr005_signed_receipt_staging")[0].n,1,
 "Duplicate receipts must not add a row");
const next={...payload,snapshotId:"c0000000-0000-4000-8000-000000000002",sequence:8};
await stageVerifiedHolidayReceipt(sqlite,{...trust,packet:signed(next)});
assert.equal(query("SELECT MAX(sequence) AS seq FROM hr005_signed_receipt_staging")[0].seq,8);
const backward={...payload,snapshotId:"c0000000-0000-4000-8000-000000000003",sequence:7};
await assert.rejects(stageVerifiedHolidayReceipt(sqlite,{...trust,packet:signed(backward)}),/replay|downgrade/i);
const duplicatedId={...next,sequence:9};
await assert.rejects(stageVerifiedHolidayReceipt(sqlite,{...trust,packet:signed(duplicatedId)}),
 /UNIQUE|constraint|unique/i,"Snapshot UUID cannot be reused with another sequence");
for(const packet of [
 {...signed({...next,sequence:9,snapshotId:"c0000000-0000-4000-8000-000000000004"}),signatureBase64:"bad"},
 {...signed({...next,sequence:9,snapshotId:"c0000000-0000-4000-8000-000000000005"}),
  payload:{...next,sequence:9,snapshotId:"c0000000-0000-4000-8000-000000000005",rules:[{...rule,orgId:foreignOrg}]}},
 signed({...next,sequence:9,snapshotId:"c0000000-0000-4000-8000-000000000006",expiresAt:now-1}),
]){
 await assert.rejects(stageVerifiedHolidayReceipt(sqlite,{...trust,packet}),
 /signature|tenant|organization|snapshot|expiry|expired|lifetime/i);
}
assert.equal(query("SELECT COUNT(*) AS n FROM hr005_signed_receipt_staging")[0].n,2);
for(const sql of [
 "UPDATE hr005_signed_receipt_staging SET sequence=100 WHERE sequence=7",
 "DELETE FROM hr005_signed_receipt_staging WHERE sequence=7",
]){
 assert.throws(()=>sqlite.exec(sql),/append-only/i,"Immutable receipt history");
}
const exportData=Buffer.from(db.export());fs.writeFileSync(dbFile,exportData);db.close();
({db,sqlite,query}=open(fs.readFileSync(dbFile)));
assert.equal(query("SELECT MAX(sequence) AS seq FROM hr005_signed_receipt_staging")[0].seq,8,
 "Staged replay sequence must survive SQLite file restart");
await assert.rejects(stageVerifiedHolidayReceipt(sqlite,{...trust,packet:signed(backward)}),
 /replay|downgrade/i,"File restart does not reset staged replay protection");
const foreign={...next,snapshotId:"c0000000-0000-4000-8000-000000000007",
 orgId:foreignOrg,sequence:9,rules:[{...rule,orgId:foreignOrg}]};
await assert.rejects(stageVerifiedHolidayReceipt(sqlite,{
 ...trust,expectedOrgId:foreignOrg,packet:signed(foreign)
}),/identity|tenant/i,"Current persisted device MUST NOT switch tenants");
const anotherDevice="a0000000-0000-4000-8000-000000000002";
const differentDevice={...next,snapshotId:"c0000000-0000-4000-8000-000000000008",
 deviceId:anotherDevice,sequence:9};
await assert.rejects(stageVerifiedHolidayReceipt(sqlite,{
 ...trust,expectedDeviceId:anotherDevice,packet:signed(differentDevice)
}),/identity|tenant/i);
const future={...next,snapshotId:"c0000000-0000-4000-8000-000000000009",sequence:9};
const originalExec=sqlite.exec;
sqlite.exec=(sql,params)=>{if(sql.startsWith("INSERT INTO hr005_signed_receipt_staging"))
  throw Error("Simulated power loss before commit");return originalExec(sql,params);};
await assert.rejects(stageVerifiedHolidayReceipt(sqlite,{...trust,packet:signed(future)}),
 /Simulated power loss/);
sqlite.exec=originalExec;
assert.equal(query("SELECT MAX(sequence) AS seq FROM hr005_signed_receipt_staging")[0].seq,8,
 "Failed transaction must roll back and preserve last accepted receipt");
const rec=await stageVerifiedHolidayReceipt(sqlite,{...trust,packet:signed(future)});
assert.equal(rec.stagedSequence,9,"Retry following rollback works");
assert.equal(cache.exportHolidayCache().length,beforeCache.length,
 "No holiday cache or other domain mutation after transactions");
assert.doesNotMatch(source,
 /hydrateHolidayCache\(|importDomainSnapshot\(|pgRpc\(|fetch\(|saveAttendance\(|assignRosterSlot\(/,
 "Staging is not an online/Windows hydration mechanism");
db.close();fs.rmSync(folder,{recursive:true,force:true});
console.log("HR005L: real SQLite append-only signed receipt staging, replay, reopen, tenant fencing, rollback, no-hydration PASS");
