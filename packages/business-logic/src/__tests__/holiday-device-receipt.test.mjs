import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
import {generateKeyPairSync,sign,webcrypto} from "node:crypto";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(module,file)=>module._compile(ts.transpileModule(
 fs.readFileSync(file,"utf8"),{fileName:file,compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
  esModuleInterop:true,inlineSourceMap:true,inlineSources:true
 }}).outputText,file);
const verifier=require("../holiday-device-receipt.ts");
const {holidayDeviceSnapshotSigningBytes,verifyHolidayDeviceSnapshot}=verifier;
const tenant="10000000-0000-4000-8000-000000000001";
const otherTenant="20000000-0000-4000-8000-000000000002";
const device="a0000000-0000-4000-8000-000000000001";
const otherDevice="a0000000-0000-4000-8000-000000000002";
const rule={
 id:"a5000000-0000-4000-8000-000000000001",
 orgId:tenant,scope:"organization",branchId:null,countryCode:null,
 date:"2026-10-11",repeatsAnnually:true,
 name:"Company review day",treatment:"informational",active:true,version:1
};
const NOW=Date.UTC(2026,9,11,16,0,0);
const payload={
 schemaVersion:1,snapshotId:"c0000000-0000-4000-8000-000000000001",
 orgId:tenant,deviceId:device,sequence:7,issuedAt:NOW-1000,
 expiresAt:NOW+60000,rules:[rule]
};
const pair=generateKeyPairSync("ed25519");
const pinnedEd25519PublicKey=new Uint8Array(
 pair.publicKey.export({format:"der",type:"spki"}).subarray(-32));
const signed=(p,key=pair.privateKey)=>({
 payload:structuredClone(p),
 signatureBase64:sign(null,Buffer.from(holidayDeviceSnapshotSigningBytes(p)),key).toString("base64")
});
const trusted={
 expectedOrgId:tenant,expectedDeviceId:device,
 lastAcceptedSequence:6,nowMs:NOW,
 pinnedEd25519PublicKey,subtle:webcrypto.subtle
};
const original=structuredClone(payload);
const valid=signed(payload);
const accepted=await verifyHolidayDeviceSnapshot({...trusted,packet:valid});
assert.equal(accepted.sequence,7);
assert.equal(accepted.deviceId,device);
assert.deepEqual(accepted.rules,[rule]);
accepted.rules[0].name="caller attempted mutation";
assert.equal(valid.payload.rules[0].name,"Company review day");
assert.deepEqual(payload,original,"Signing and verification never modify source records");

// The signature covers every identity, version, treatment, activity, day,
// sequence and validity window; changing a signed value MUST invalidate it.
for (const altered of [
 {sequence:8},
 {deviceId:otherDevice},
 {orgId:otherTenant},
 {issuedAt:NOW-2000},
 {expiresAt:NOW+70000},
 {rules:[{...rule,name:"Unexpected label edit"}]},
 {rules:[{...rule,version:2}]},
 {rules:[{...rule,date:"2026-10-12"}]},
 {rules:[{...rule,treatment:"non_working"}]},
 {rules:[{...rule,active:false}]},
]) {
 const tampered=structuredClone(valid);
 Object.assign(tampered.payload,altered);
 await assert.rejects(
  verifyHolidayDeviceSnapshot({...trusted,packet:tampered}),
  /signature|destination|snapshot|organization/i);
}
const differentKey=generateKeyPairSync("ed25519");
await assert.rejects(verifyHolidayDeviceSnapshot({
 ...trusted,packet:signed(payload,differentKey.privateKey)
}),/signature/i);
await assert.rejects(verifyHolidayDeviceSnapshot({
 ...trusted,packet:valid,lastAcceptedSequence:7
}),/replay|stale/i);
await assert.rejects(verifyHolidayDeviceSnapshot({
 ...trusted,packet:valid,expectedDeviceId:otherDevice
}),/destination/i);
await assert.rejects(verifyHolidayDeviceSnapshot({
 ...trusted,packet:valid,expectedOrgId:otherTenant
}),/destination/i);
await assert.rejects(verifyHolidayDeviceSnapshot({
 ...trusted,packet:valid,nowMs:NOW+60001
}),/expired/i);
await assert.rejects(verifyHolidayDeviceSnapshot({
 ...trusted,packet:valid,nowMs:NOW-70000
}),/future/i);
await assert.rejects(verifyHolidayDeviceSnapshot({
 ...trusted,packet:{...valid,signatureBase64:"bad"}
}),/signature/i);
await assert.rejects(verifyHolidayDeviceSnapshot({
 ...trusted,packet:valid,pinnedEd25519PublicKey:new Uint8Array()
}),/key|trusted/i);
await assert.rejects(verifyHolidayDeviceSnapshot({
 ...trusted,packet:valid,lastAcceptedSequence:-1
}),/trusted|sequence/i);
await assert.rejects(verifyHolidayDeviceSnapshot({
 ...trusted,packet:valid,subtle:null
}),/WebCrypto|trusted/i);
for (const altered of [
 {schemaVersion:2},
 {sequence:0},
 {issuedAt:NOW+10000,expiresAt:NOW+10000+16*60*1000},
 {issuedAt:NOW+10000,expiresAt:NOW+9000},
 {rules:[rule,rule]},
 {rules:[{...rule,orgId:otherTenant}]},
 {rules:[{...rule,date:"2026-02-30"}]},
 {rules:[{...rule,branchId:"wrong",scope:"branch"}]}
]){
 await assert.rejects(verifyHolidayDeviceSnapshot({
  ...trusted,packet:signed({...payload,...altered})
 }),/holiday|snapshot|duplicate|tenant|date/i);
}
const cache=require("../holiday-cache.ts");
assert.doesNotMatch(
 fs.readFileSync("packages/business-logic/src/holiday-device-receipt.ts","utf8"),
 /hydrateHolidayCache\(|pgRpc\(|fetch\(|enqueueOutbox\(|assignRosterSlot\(|saveAttendance\(/,
 "Signature preflight cannot perform Cloud or Windows writes");
const exported=require("../index.ts");
assert.equal(typeof exported.holidayDeviceReceipt.verifyHolidayDeviceSnapshot,"function");
assert.equal(typeof cache.hydrateHolidayCache,"function");
console.log("HR005 real Ed25519 tenant/device/expiry/replay-bound signed holiday snapshot verification and NO-WRITE PASS");
