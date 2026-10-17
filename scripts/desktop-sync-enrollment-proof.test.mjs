import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { signNativeEnrollmentChallenge, verifyNativeEnrollmentProof } =
  require("../apps/desktop/electron/sync-enrollment-proof.ts");

const keyPair = generateKeyPairSync("ed25519");
const stranger = generateKeyPairSync("ed25519");
const keyBase64Url = keyPair.publicKey.export({ format: "der", type: "spki" })
  .subarray(-32).toString("base64url");
const ORG = "10000000-0000-4000-8000-000000000001";
const DEVICE = "20000000-0000-4000-8000-000000000001";
const ACTOR = "30000000-0000-4000-8000-000000000001";
const CHALLENGE = "40000000-0000-4000-8000-000000000001";
const BRANCH = "50000000-0000-4000-8000-000000000001";
const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);
const nonce = randomBytes(32).toString("base64url");

function challenge(overrides = {}) {
  return { type:"minarvabiz-sync-enrollment-challenge-v1", version:1,
    challengeId:CHALLENGE, orgId:ORG, deviceId:DEVICE, actorUserId:ACTOR,
    branchId:BRANCH, nonce, issuedAtMs:NOW-30_000, expiresAtMs:NOW+60_000,
    ...overrides };
}
function sign(ch = challenge(), overrides = {}) {
  return signNativeEnrollmentChallenge(ch, {
    expectedOrgId:ORG,expectedDeviceId:DEVICE,expectedActorUserId:ACTOR,
    expectedBranchId:BRANCH,expectedPublicKeyBase64Url:keyBase64Url,
    privateKey:keyPair.privateKey,nowMs:NOW,...overrides,
  });
}
function trust(overrides = {}) {
  const consumed = new Set();
  return {expectedOrgId:ORG,expectedDeviceId:DEVICE,expectedActorUserId:ACTOR,
    expectedBranchId:BRANCH,expectedChallengeId:CHALLENGE,expectedNonce:nonce,
    registeredPublicKeyBase64Url:keyBase64Url,nowMs:NOW,
    consumeChallenge:async(id)=>{if(consumed.has(id))return false;consumed.add(id);return true;},
    ...overrides};
}
test("signed proof verifies only for registered key and server-bound challenge",async()=>{
  const proof=sign();
  assert.equal(proof.ok,true);
  const verified=await verifyNativeEnrollmentProof(proof.proof,trust());
  assert.deepEqual(verified,{ok:true,deviceId:DEVICE,challengeId:CHALLENGE});
});
test("a challenge is consumed atomically once, including concurrent verification",async()=>{
  const proof=sign().proof;
  const ctx=trust();
  const result=await Promise.all([
    verifyNativeEnrollmentProof(proof,ctx),
    verifyNativeEnrollmentProof(proof,ctx)
  ]);
  assert.equal(result.filter(x=>x.ok).length,1);
  assert.equal(result.filter(x=>!x.ok&&x.code==="replayed").length,1);
});
test("foreign actor, tenant, branch, device, nonce or challenge ID cannot be signed",()=>{
  for(const changes of [
    {orgId:"60000000-0000-4000-8000-000000000001"},
    {deviceId:"60000000-0000-4000-8000-000000000001"},
    {actorUserId:"60000000-0000-4000-8000-000000000001"},
    {branchId:"60000000-0000-4000-8000-000000000001"},
  ]) assert.deepEqual(sign(challenge(changes)),{ok:false,code:"scope_mismatch"});
  for(const invalid of [
    {nonce:"bad"}, {challengeId:"bad"}, {version:2},
    {issuedAtMs:NOW+1}, {expiresAtMs:NOW},
    {expiresAtMs:NOW+600_000}, {extraField:"untrusted"}
  ]) assert.equal(sign(challenge(invalid)).ok,false);
});
test("invalid proof, key substitution and wrong signing domain fail before nonce consumption",async()=>{
  const good=sign().proof;
  let consumed=0;
  const ctx=trust({consumeChallenge:async()=>{consumed++;return true;}});
  for(const proof of [
    {...good,publicKeyBase64Url:"A".repeat(43)},
    {...good,signatureBase64Url:good.signatureBase64Url.slice(0,-2)+"aa"},
    {...good,challenge:{...good.challenge,branchId:"60000000-0000-4000-8000-000000000001"}},
    {...good,challenge:{...good.challenge,nonce:randomBytes(32).toString("base64url")}},
    {...good,unexpected:true},
  ]) {
    const result=await verifyNativeEnrollmentProof(proof,ctx);
    assert.equal(result.ok,false,JSON.stringify(proof));
  }
  assert.equal(consumed,0);
  assert.equal(sign(challenge(),{privateKey:stranger.privateKey}).ok,false,
    "native signing key must match registered key only after server verification");
});
test("expired challenges, wrong registered key, nonce-consumption failure fail closed",async()=>{
  const proof=sign().proof;
  assert.equal((await verifyNativeEnrollmentProof(proof,trust({
    nowMs:NOW+70_000}))).code,"expired");
  assert.equal((await verifyNativeEnrollmentProof(proof,trust({
    registeredPublicKeyBase64Url:stranger.publicKey.export({format:"der",type:"spki"})
      .subarray(-32).toString("base64url")}))).code,"invalid_signature");
  assert.equal((await verifyNativeEnrollmentProof(proof,trust({
    consumeChallenge:async()=>{throw Error("offline");}}))).code,"replayed");
  assert.equal((await verifyNativeEnrollmentProof(proof,trust({
    consumeChallenge:async()=>false}))).code,"replayed");
});
