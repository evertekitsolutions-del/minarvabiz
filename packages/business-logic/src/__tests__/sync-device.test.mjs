import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),
 {fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,\n  inlineSourceMap:true,inlineSources:true}}).outputText,f);
const {requireVerifiedFinancialSyncDevice:verify}=require("../sync-device.ts");
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const actor={organizationId:uuid(1),actorUserId:uuid(2),companyId:uuid(3),
 branchId:uuid(4),warehouseId:uuid(5),canPostFinancialSync:true,
 companyGrantVerified:true,warehouseGrantVerified:true};
const device={organizationId:uuid(1),deviceId:uuid(6),
 publicKeySha256:"a".repeat(64),revokedAt:null};
const grant={organizationId:uuid(1),deviceId:uuid(6),branchId:uuid(4),revokedAt:null};
const signed={organizationId:uuid(1),actorUserId:uuid(2),companyId:uuid(3),
 branchId:uuid(4),warehouseId:uuid(5),deviceId:uuid(6),
 publicKeySha256:"a".repeat(64),operationId:uuid(9),
 operationDigestSha256:"b".repeat(64),nonce:"nonce_123456789012345",
 issuedAt:"2026-10-21T07:00:00.000Z",signature:"signed_challenge_proof_123456789"};
const now=new Date("2026-10-21T07:01:00.000Z");
test("valid active explicit host proofs require signed challenge verifier",()=>{
 assert.equal(verify(actor,device,grant,signed,()=>true,now,true),true);
 assert.throws(()=>verify(actor,device,grant,signed,()=>true,now),/disabled/);
 assert.throws(()=>verify(actor,device,grant,signed,undefined,now,true),/Trusted/);
 assert.throws(()=>verify(actor,device,grant,signed,()=>({passed:true}),now,true),/cryptographic/);
});
test("foreign tenant, company, branch, warehouse and revoked device are denied",()=>{
 const altered=[
  [ {...actor,canPostFinancialSync:false},device,grant,signed ],
  [ {...actor,companyGrantVerified:false},device,grant,signed ],
  [ {...actor,warehouseGrantVerified:false},device,grant,signed ],
  [ actor,{...device,organizationId:uuid(88)},grant,signed ],
  [ actor,device,{...grant,branchId:uuid(88)},signed ],
  [ actor,device,grant,{...signed,companyId:uuid(88)} ],
  [ actor,device,grant,{...signed,warehouseId:uuid(88)} ],
  [ actor,{...device,revokedAt:"2026-10-20T00:00:00.000Z"},grant,signed ],
  [ actor,device,{...grant,revokedAt:"2026-10-20T00:00:00.000Z"},signed ],
 ];
 for(const [a,d,g,s] of altered)assert.throws(()=>verify(a,d,g,s,()=>true,now,true));
});
test("altered payload, device fingerprint and replayish challenge fields rejected",()=>{
 for(const bad of [
  {...signed,operationId:"bad"}, {...signed,operationDigestSha256:"0".repeat(63)},
  {...signed,publicKeySha256:"c".repeat(64)},
  {...signed,nonce:"short"}, {...signed,signature:"short"},
  {...signed,issuedAt:"2026-10-21T06:40:00.000Z"},
  {...signed,issuedAt:"2026-10-21T07:02:00.000Z"},
 ]) assert.throws(()=>verify(actor,device,grant,bad,()=>true,now,true));
 assert.throws(()=>verify(actor,device,grant,signed,()=>true,new Date("invalid"),true),/Expired/);
});
