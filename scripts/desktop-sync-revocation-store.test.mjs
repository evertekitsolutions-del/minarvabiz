import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import { generateKeyPairSync, sign } from "node:crypto";

const require = createRequire(import.meta.url);
const { createNativeRevocationStore } = require("../apps/desktop/electron/sync-revocation-store.ts");
const { isVerifiedSyncRevocationSnapshot } =
  require("../apps/desktop/electron/sync-revocations.ts");
const keys = generateKeyPairSync("ed25519");
const foreignKeys = generateKeyPairSync("ed25519");
const pub = keys.publicKey.export({ type:"spki",format:"der" }).subarray(-32).toString("hex");
const orgId = "10000000-0000-4000-8000-000000000001";
const deviceId = "20000000-0000-4000-8000-000000000001";
const otherOrg = "30000000-0000-4000-8000-000000000001";
const credentialId = "40000000-0000-4000-8000-000000000001";
const branchId = "50000000-0000-4000-8000-000000000001";
const nowBase = Date.UTC(2026,9,17,10);
const DAY = 86_400_000;
function signed(sequence, change={},privateKey=keys.privateKey) {
  const payload = {
    type:"minarvabiz-sync-revocations-v1",version:1,keyId:"revocation-k1",
    orgId,deviceId,sequence,
    issuedAtMs:nowBase-DAY,expiresAtMs:nowBase+6*DAY,
    revokedCredentialIds:[credentialId],revokedBranchIds:[branchId],...change,
  };
  const body=Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature=sign(null,Buffer.from("MINARVA-BIZ:B1:SYNC-REVOCATIONS:v1:"+body),
    privateKey).toString("base64url");
  return body+"."+signature;
}
async function sandbox(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"minarva-b1-journal-"));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  return dir;
}
const trustedAnchors = new Map();
function options(userData,clock){
  return {userData,expectedOrgId:orgId,expectedDeviceId:deviceId,
    trustedKeyId:"revocation-k1",pinnedEd25519PublicKeyHex:pub,nowMs:()=>clock.now,
    anchor:{
      read:async()=>structuredClone(trustedAnchors.get(userData) ??
        {sequence:0,tokenSha256:null,acceptedAtMs:0}),
      write:async next=>{ trustedAnchors.set(userData,structuredClone(next)); },
    },
  };
}
function journal(root){
  return path.join(root,"b1-revocations",orgId+"-"+deviceId);
}
const filename=sequence=>"snapshot-"+String(sequence).padStart(16,"0")+".json";

test("signed snapshot survives restart and replay remains forbidden",async t=>{
  const dir=await sandbox(t),clock={now:nowBase};
  const a=createNativeRevocationStore(options(dir,clock));
  assert.equal(await a.recover(),null);
  const first=await a.accept(signed(8));
  assert.equal(first.sequence,8);
  assert.equal(isVerifiedSyncRevocationSnapshot(first),true);
  const reopened=createNativeRevocationStore(options(dir,clock));
  const recovered=await reopened.recover();
  assert.equal(recovered.sequence,8);
  assert.equal(isVerifiedSyncRevocationSnapshot(recovered),true);
  await assert.rejects(reopened.accept(signed(8)),/replay/);
  await assert.rejects(reopened.accept(signed(7)),/replay/);
  await reopened.accept(signed(9));
  assert.equal((await reopened.recover()).sequence,9);
  assert.deepEqual((await fs.readdir(journal(dir))).sort(),
    [filename(8),filename(9)]);
  assert.equal(await fs.readFile(path.join(journal(dir),filename(8)),"utf8")
    .then(s=>JSON.parse(s).sequence),8,"prior signed record is preserved");
});

test("new signed record can advance an expired predecessor without downgrading",async t=>{
  const dir=await sandbox(t),clock={now:nowBase};
  const store=createNativeRevocationStore(options(dir,clock));
  await store.accept(signed(10,{expiresAtMs:nowBase+DAY}));
  clock.now=nowBase+2*DAY;
  await assert.rejects(store.recover(),/untrusted/);
  const fresh=signed(12,{issuedAtMs:nowBase+DAY,expiresAtMs:nowBase+6*DAY});
  assert.equal((await store.accept(fresh)).sequence,12);
  assert.equal((await store.recover()).sequence,12);
});

test("tampering, foreign identity and invalid signatures never publish authority",async t=>{
  const dir=await sandbox(t),clock={now:nowBase};
  const store=createNativeRevocationStore(options(dir,clock));
  await assert.rejects(store.accept(signed(1,{orgId:otherOrg})),/scope_mismatch/);
  await assert.rejects(store.accept(signed(1,{},foreignKeys.privateKey)),/invalid_signature/);
  assert.equal(await store.recover(),null);
  await store.accept(signed(1));
  const path1=path.join(journal(dir),filename(1));
  const raw=JSON.parse(await fs.readFile(path1,"utf8"));
  raw.sha256="a".repeat(64);
  await fs.writeFile(path1,JSON.stringify(raw),"utf8");
  await assert.rejects(store.recover(),/b1_state_corrupt/);
  await assert.rejects(store.accept(signed(2)),/b1_state_corrupt/);
});

test("clock rollback and interrupted writer state fail closed",async t=>{
  const dir=await sandbox(t),clock={now:nowBase};
  const store=createNativeRevocationStore(options(dir,clock));
  await store.accept(signed(1));
  clock.now=nowBase-6*60_000;
  await assert.rejects(store.recover(),/b1_clock_untrusted/);
  await assert.rejects(store.accept(signed(2)),/b1_clock_untrusted/);
  clock.now=nowBase;
  await fs.writeFile(path.join(journal(dir),"writer.lock"),"crashed");
  await assert.rejects(store.recover(),/b1_state_locked/);
  await assert.rejects(store.accept(signed(2)),/EEXIST/);
  assert.equal((await fs.readdir(journal(dir))).includes(filename(2)),false);
});

test("orphan temporary file is never treated as committed authority",async t=>{
  const dir=await sandbox(t),clock={now:nowBase};
  const store=createNativeRevocationStore(options(dir,clock));
  await store.accept(signed(1));
  await fs.writeFile(path.join(journal(dir),
    ".pending-10000000-0000-4000-8000-000000000001"),signed(2));
  assert.equal((await store.recover()).sequence,1);
});

test("two independent writers cannot replace a committed sequence",async t=>{
  const dir=await sandbox(t),clock={now:nowBase};
  const a=createNativeRevocationStore(options(dir,clock));
  const b=createNativeRevocationStore(options(dir,clock));
  const values=await Promise.allSettled([a.accept(signed(1)),b.accept(signed(1))]);
  assert.equal(values.filter(v=>v.status==="fulfilled").length,1);
  assert.equal((await a.recover()).sequence,1);
});


test("deleting latest journal record cannot bypass separately anchored sequence", async t=>{
  const dir=await sandbox(t), clock={now:nowBase};
  const store=createNativeRevocationStore(options(dir,clock));
  await store.accept(signed(15));
  await store.accept(signed(16));
  await fs.unlink(path.join(journal(dir),filename(16)));
  await assert.rejects(store.recover(),/b1_state_rollback/);
  await assert.rejects(store.accept(signed(17)),/b1_state_rollback/);
  await fs.unlink(path.join(journal(dir),filename(15)));
  await assert.rejects(store.recover(),/b1_state_rollback/,
    "Removing all journal records must not be confused with fresh enrollment");
});

test("replacing a signed record with another valid one at the same sequence fails against anchor hash",async t=>{
  const dir=await sandbox(t), clock={now:nowBase};
  const store=createNativeRevocationStore(options(dir,clock));
  await store.accept(signed(19));
  const otherSigned=signed(19,{revokedCredentialIds:[],revokedBranchIds:[]});
  const file=path.join(journal(dir),filename(19));
  const record=JSON.parse(await fs.readFile(file,"utf8"));
  record.token=otherSigned;
  record.sha256=(await import("node:crypto")).createHash("sha256")
    .update(otherSigned).digest("hex");
  await fs.writeFile(file,JSON.stringify(record));
  await assert.rejects(store.recover(),/b1_state_rollback/);
});

test("failed external anchor commit never publishes usable authority",async t=>{
  const dir=await sandbox(t),clock={now:nowBase};
  const config=options(dir,clock);
  config.anchor.write=async()=>{throw Error("simulated OS secure storage failure");};
  const store=createNativeRevocationStore(config);
  await assert.rejects(store.accept(signed(1)),/simulated OS secure storage failure/);
  assert.deepEqual(await fs.readdir(journal(dir)),[filename(1)],
    "Staged signed journal remains for explicit repair; writer lock must be released");
  await assert.rejects(store.recover(),/b1_state_rollback/,
    "Unsigned anchor update cannot silently gain authority on reboot");
  await assert.rejects(store.accept(signed(2)),/b1_state_rollback/,
    "No further operations until native recovery explicitly reconciles anchor");
});

test("malformed external trust anchor is never silently treated as first enrollment",async t=>{
  const dir=await sandbox(t),clock={now:nowBase};
  const config=options(dir,clock);
  config.anchor.read=async()=>({sequence:0,tokenSha256:"0".repeat(64),acceptedAtMs:0});
  const store=createNativeRevocationStore(config);
  await assert.rejects(store.accept(signed(1)),/b1_anchor_untrusted/);
  await assert.rejects(store.recover(),/b1_anchor_untrusted/);
});


test("later signed snapshots cannot silently remove a historical credential or branch revocation",async t=>{
  const dir=await sandbox(t), clock={now:nowBase};
  const store=createNativeRevocationStore(options(dir,clock));
  await store.accept(signed(20));
  await assert.rejects(store.accept(signed(21,{revokedCredentialIds:[]})),
    /revocations must be monotonic/);
  await assert.rejects(store.accept(signed(21,{revokedBranchIds:[]})),
    /revocations must be monotonic/);
  assert.equal((await store.recover()).sequence,20);
  const addedCredential="40000000-0000-4000-8000-000000000002";
  const addedBranch="50000000-0000-4000-8000-000000000002";
  assert.equal((await store.accept(signed(21,{
    revokedCredentialIds:[credentialId,addedCredential],
    revokedBranchIds:[branchId,addedBranch],
  })).sequence,21);
  assert.equal((await createNativeRevocationStore(options(dir,clock)).recover()).sequence,21);
});


test("accepted clock high-water never decreases inside tolerated skew window",async t=>{
  const dir=await sandbox(t),clock={now:nowBase};
  const store=createNativeRevocationStore(options(dir,clock));
  await store.accept(signed(31));
  clock.now=nowBase-2*60_000;
  await store.accept(signed(32));
  const record=JSON.parse(await fs.readFile(path.join(journal(dir),filename(32)),"utf8"));
  assert.equal(record.acceptedAtMs,nowBase);
  assert.equal(trustedAnchors.get(dir).acceptedAtMs,nowBase);
  assert.equal((await store.recover()).sequence,32);
  clock.now=nowBase-5*60_000-1;
  await assert.rejects(store.recover(),/b1_clock_untrusted/);
});
