import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import Module from "node:module";
import { generateKeyPairSync, sign as edSign } from "node:crypto";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const issuerPath = path.resolve("apps/web/src/lib/b1-sync-authority-issuer.server.ts");
const source = fs.readFileSync(issuerPath,"utf8");
const loaded = new Module(issuerPath);
loaded.filename = issuerPath;
loaded.paths = Module._nodeModulePaths(path.dirname(issuerPath));
loaded.require = name => name === "server-only" ? {} : createRequire(issuerPath)(name);
loaded._compile(ts.transpileModule(source,{fileName:issuerPath,compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,
}}).outputText,issuerPath);
const { signDeviceAuthorityDraftServerOnly: issue } = loaded.exports;
const { verifyNativeDeviceAuthority } = require("../../../../apps/desktop/electron/sync-authority.ts");
const { verifyNativeSyncRevocations } = require("../../../../apps/desktop/electron/sync-revocations.ts");

const now=Date.UTC(2026,9,17,12);
const DAY=86_400_000;
const enrollmentPair=generateKeyPairSync("ed25519");
const revocationPair=generateKeyPairSync("ed25519");
const publicRaw=enrollmentPair.publicKey.export({format:"der",type:"spki"}).subarray(-32);
const enrollmentHex=publicRaw.toString("hex");
const revocationHex=revocationPair.publicKey.export({format:"der",type:"spki"})
  .subarray(-32).toString("hex");
const orgId="10000000-0000-4000-8000-000000000001";
const deviceId="20000000-0000-4000-8000-000000000001";
const actorUserId="30000000-0000-4000-8000-000000000001";
const branchId="40000000-0000-4000-8000-000000000001";
const credentialId="50000000-0000-4000-8000-000000000001";
const payload=()=>({
  type:"minarvabiz-sync-device-authority-v1",version:1,keyId:"enrollment-key-a",
  credentialId,orgId,deviceId,actorUserId,role:"admin",allowedBranchIds:[branchId],
  issuedAtMs:now,notBeforeMs:now,expiresAtMs:now+DAY,
});
const params=(options={})=>({
  payload:payload(),privateKey:enrollmentPair.privateKey,
  pinnedPublicKeyHex:enrollmentHex,expectedOrgId:orgId,expectedDeviceId:deviceId,
  expectedActorUserId:actorUserId,expectedKeyId:"enrollment-key-a",
  expectedAllowedBranchIds:[branchId],trustedNowMs:now,...options,
});
function revokeEvidence(){
  const content={
    type:"minarvabiz-sync-revocations-v1",version:1,keyId:"revocation-key-a",
    orgId,deviceId,sequence:1,issuedAtMs:now-DAY,expiresAtMs:now+DAY,
    revokedCredentialIds:[],revokedBranchIds:[],
  };
  const body=Buffer.from(JSON.stringify(content)).toString("base64url");
  const sig=edSign(null,Buffer.from("MINARVA-BIZ:B1:SYNC-REVOCATIONS:v1:"+body),
    revocationPair.privateKey).toString("base64url");
  const result=verifyNativeSyncRevocations(body+"."+sig,{
    trustedKeyId:"revocation-key-a",pinnedEd25519PublicKeyHex:revocationHex,
    expectedOrgId:orgId,expectedDeviceId:deviceId,lastAcceptedSequence:0,
    lastTrustedClockMs:now-DAY,nowMs:now,
  });
  assert.equal(result.ok,true);
  return result.snapshot;
}
function desktopVerify(token){
  return verifyNativeDeviceAuthority(token,{
    trustedKeyId:"enrollment-key-a",pinnedEd25519PublicKeyHex:enrollmentHex,
    expectedOrgId:orgId,expectedDeviceId:deviceId,expectedActorUserId:actorUserId,
    expectedBranchId:branchId,nowMs:now,lastTrustedClockMs:now-DAY,
    revocationSnapshot:revokeEvidence(),
  });
}
test("server-issued token is accepted by real native signature verifier",()=>{
  const result=issue(params());
  assert.equal(typeof result,"string");
  assert.equal(desktopVerify(result).ok,true);
  assert.equal(result.split(".").length,2);
  assert.deepEqual(payload(),params().payload);
});
test("issuer rejects mismatched signer keys and mixed tenant/actor/device/branch",()=>{
  const foreign=generateKeyPairSync("ed25519");
  for(const bad of [
    {privateKey:foreign.privateKey},
    {privateKey:enrollmentPair.publicKey},
    {pinnedPublicKeyHex:"00".repeat(32)},
    {expectedOrgId:"90000000-0000-4000-8000-000000000001"},
    {expectedDeviceId:"90000000-0000-4000-8000-000000000001"},
    {expectedActorUserId:"90000000-0000-4000-8000-000000000001"},
    {expectedKeyId:"other"},
    {expectedAllowedBranchIds:["90000000-0000-4000-8000-000000000001"]},
  ]) assert.throws(()=>issue(params(bad)),/trusted|key|scope|mismatch|invalid/i);
});
test("issuer refuses forged roles, noncanonical grants, invalid lifetimes and extra fields",()=>{
  const original=payload();
  for(const badPayload of [
    {...original,role:"root"}, {...original,keyId:""},
    {...original,allowedBranchIds:[]},
    {...original,allowedBranchIds:[branchId,branchId]},
    {...original,issuedAtMs:now+1e8,notBeforeMs:now+1e8,expiresAtMs:now+1e8+DAY},
    {...original,expiresAtMs:now+31*DAY},
    {...original,expiresAtMs:now},
    {...original,extra:"untrusted"},
  ]) assert.throws(()=>issue(params({payload:badPayload})),/invalid|scope|lifetime|field|expire/i);
});
test("no public route, privileged key loading, or hidden environmental fallback",()=>{
  assert.match(source,/^import "server-only";/);
  assert.doesNotMatch(source,/process\.env|localStorage|fetch\(|NextRequest|NextResponse|export (async )?function (POST|GET)|console\.log/);
  const token=issue(params());
  const [data,sig]=token.split(".");
  const altered=JSON.parse(Buffer.from(data,"base64url").toString("utf8"));
  altered.role="super_admin";
  assert.equal(desktopVerify(Buffer.from(JSON.stringify(altered)).toString("base64url")+"."+sig).ok,false);
});
