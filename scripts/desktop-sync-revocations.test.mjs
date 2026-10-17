import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { generateKeyPairSync, sign } from "node:crypto";

const require = createRequire(import.meta.url);
const { verifyNativeSyncRevocations, isVerifiedSyncRevocationSnapshot } =
  require("../apps/desktop/electron/sync-revocations.ts");
const pair = generateKeyPairSync("ed25519");
const foreignPair = generateKeyPairSync("ed25519");
const key = pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
const now = Date.UTC(2026,9,17,10);
const DAY = 86_400_000;
const orgId = "10000000-0000-4000-8000-000000000001";
const deviceId = "20000000-0000-4000-8000-000000000001";
const credential = "30000000-0000-4000-8000-000000000001";
const branch = "40000000-0000-4000-8000-000000000001";
const prefix = "MINARVA-BIZ:B1:SYNC-REVOCATIONS:v1:";
const base = overrides => ({
  type:"minarvabiz-sync-revocations-v1", version:1,
  keyId:"revocation-k1",orgId,deviceId,sequence:8,
  issuedAtMs:now-DAY,expiresAtMs:now+DAY,
  revokedCredentialIds:[credential], revokedBranchIds:[branch],
  ...overrides,
});
const signed = (payload = base(),priv=pair.privateKey,domain=prefix) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(null,Buffer.from(domain+body),priv).toString("base64url");
  return body+"."+signature;
};
const trust = overrides => ({
  trustedKeyId:"revocation-k1",pinnedEd25519PublicKeyHex:key,
  expectedOrgId:orgId,expectedDeviceId:deviceId,
  lastAcceptedSequence:7,lastTrustedClockMs:now-DAY,nowMs:now,
  ...overrides,
});
const result = (s=signed(),t=trust()) => verifyNativeSyncRevocations(s,t);
const status = (s=signed(),t=trust()) => { const x=result(s,t);return x.ok?"ok":x.code; };

test("accepts signed, domain-bound snapshot with immutable arrays and native provenance",()=>{
  const x=result();
  assert.equal(x.ok,true);
  assert.equal(x.snapshot.sequence,8);
  assert.equal(isVerifiedSyncRevocationSnapshot(x.snapshot),true);
  assert.equal(isVerifiedSyncRevocationSnapshot({...x.snapshot}),false);
  assert.equal(isVerifiedSyncRevocationSnapshot({...x.snapshot,verified:true}),false);
  assert.ok(Object.isFrozen(x.snapshot));
  assert.ok(Object.isFrozen(x.snapshot.revokedCredentialIds));
  assert.ok(Object.isFrozen(x.snapshot.revokedBranchIds));
});

test("rejects forged, altered or wrong-key signed snapshots",()=>{
  assert.equal(status(signed(base(),foreignPair.privateKey)),"invalid_signature");
  assert.equal(status(signed(base(),pair.privateKey,"OTHER:")),"invalid_signature");
  assert.equal(status(signed(),trust({pinnedEd25519PublicKeyHex:"00".repeat(32)})),"invalid_signature");
  assert.equal(status(signed(),trust({trustedKeyId:"another"})),"invalid_signature");
  const parts=signed().split(".");
  const tampered=Buffer.from(JSON.stringify(base({sequence:9}))).toString("base64url");
  assert.equal(status(tampered+"."+parts[1]),"invalid_signature");
});

test("fail closed on cross-tenant/device binding and replay across native restarts",()=>{
  assert.equal(status(signed(),trust({expectedOrgId:"90000000-0000-4000-8000-000000000001"})),"scope_mismatch");
  assert.equal(status(signed(),trust({expectedDeviceId:"90000000-0000-4000-8000-000000000002"})),"scope_mismatch");
  assert.equal(status(signed(),trust({lastAcceptedSequence:8})),"replay");
  assert.equal(status(signed(),trust({lastAcceptedSequence:9})),"replay");
  assert.equal(status(signed(),trust({lastAcceptedSequence:-1})),"replay");
});

test("expiry, publication in future and suspicious clock rollback are denied",()=>{
  assert.equal(status(signed(base({issuedAtMs:now-2*DAY,expiresAtMs:now-DAY}))),"stale");
  assert.equal(status(signed(base({issuedAtMs:now+DAY,expiresAtMs:now+2*DAY}))),"stale");
  assert.equal(status(signed(),trust({nowMs:now+DAY})),"stale");
  assert.equal(status(signed(),trust({lastTrustedClockMs:now+6*60_000})),"clock_untrusted");
});

test("signed malformed fields and noncanonical JSON are rejected",()=>{
  const invalid=[
    {type:"other"}, {version:2}, {keyId:"UPPERCASE"},
    {sequence:0}, {sequence:1.5}, {sequence:Number.MAX_SAFE_INTEGER+1},
    {revokedCredentialIds:[credential,credential]},
    {revokedCredentialIds:["not-a-uuid"]},
    {revokedBranchIds:[branch,branch]},
    {issuedAtMs:now+DAY,expiresAtMs:now},
    {expiresAtMs:now+8*DAY},
    {unexpected:"field"},
  ];
  for(const change of invalid)
    assert.equal(status(signed(base(change))),"malformed",JSON.stringify(change));
  const reversed={sequence:8,...base()};
  assert.equal(status(signed(reversed)),"malformed");
  const raw=JSON.stringify(base()).replace('"sequence":8','"sequence":7,"sequence":8');
  const body=Buffer.from(raw).toString("base64url");
  const sig=sign(null,Buffer.from(prefix+body),pair.privateKey).toString("base64url");
  assert.equal(status(body+"."+sig),"malformed");
  for(const malformed of ["","bad",".abc","!@#.xyz","a".repeat(128*1024+1),null,{}])
    assert.equal(status(malformed),"malformed");
});
