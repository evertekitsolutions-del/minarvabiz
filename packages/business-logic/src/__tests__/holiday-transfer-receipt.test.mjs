import assert from "node:assert/strict";
import fs from "node:fs";
import { webcrypto } from "node:crypto";
import { createRequire } from "node:module";
if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", {value: webcrypto});
const require = createRequire(import.meta.url),ts = require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(
 fs.readFileSync(file,"utf8"),{fileName:file,compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
  esModuleInterop:true,inlineSourceMap:true,inlineSources:true
 }}).outputText,file);
const transfer = require("../holiday-transfer-receipt.ts");
const orgId="10000000-0000-4000-8000-000000000001";
const deviceId="d1000000-0000-4000-8000-000000000001";
const receiptId="e1000000-0000-4000-8000-000000000001";
const rule=(n)=>({
 id:"a5000000-0000-4000-8000-"+String(n).padStart(12,"0"),
 orgId,scope:"organization",countryCode:null,branchId:null,
 date:"2026-10-11",repeatsAnnually:false,name:"Company closure "+n,
 treatment:"non_working",active:true,version:n
});
const rows=[rule(2),rule(1)];
const copy=structuredClone(rows);
const digest=await transfer.holidaySnapshotDigest(rows);
assert.match(digest,/^[0-9a-f]{64}$/);
assert.equal(await transfer.holidaySnapshotDigest(rows.slice().reverse()),digest,
 "Canonical order must be independent of transport ordering");
assert.deepEqual(rows,copy,"Digest must never mutate caller snapshot");
const keys=await webcrypto.subtle.generateKey(
 {name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]
);
const keysOther=await webcrypto.subtle.generateKey(
 {name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]
);
const now=Date.parse("2026-10-11T16:00:00.000Z");
const receipt={
 orgId,deviceId,receiptId,
 issuedAt:"2026-10-11T15:59:00.000Z",
 expiresAt:"2026-10-11T16:10:00.000Z",
 snapshotSha256:digest
};
const sign=async r=>Buffer.from(await webcrypto.subtle.sign(
 {name:"ECDSA",hash:"SHA-256"},keys.privateKey,
 transfer.holidayTransferSigningBytes(r)
)).toString("base64url");
const signature=await sign(receipt);
assert.equal(signature.length,86);
const args={receipt,signature,trustedPublicKey:keys.publicKey,
 expectedOrgId:orgId,expectedDeviceId:deviceId,
 snapshot:rows,nowEpochMs:now,consumedReceiptIds:new Set()};
const valid=await transfer.verifyHolidayTransferReceipt(args);
assert.deepEqual(valid,receipt);
assert.notEqual(valid,receipt,"Successful verification must not grant mutable receipt references");
assert.deepEqual(rows,copy,"Preflight has no cache/snapshot mutations");
const rejects=async(patch,pattern)=>assert.rejects(
 ()=>transfer.verifyHolidayTransferReceipt({...args,...patch}),
 pattern
);
await rejects({expectedOrgId:"20000000-0000-4000-8000-000000000002"},/tenant|device/);
await rejects({expectedDeviceId:"d1000000-0000-4000-8000-000000000002"},/tenant|device/);
await rejects({consumedReceiptIds:new Set([receiptId])},/consumed|replay/);
await rejects({consumedReceiptIds:null},/context/);
await rejects({nowEpochMs:Date.parse("2026-10-11T16:11:00.000Z")},/expired/);
await rejects({nowEpochMs:Date.parse("2026-10-11T15:55:00.000Z")},/future/);
await rejects({snapshot:[{...rule(1),name:"Tampered"},rule(2)]},/digest mismatch/);
await rejects({snapshot:[rule(1),rule(1)]},/Duplicate/);
await rejects({snapshot:[{...rule(1),orgId:"20000000-0000-4000-8000-000000000002"}]},/tenant|organization/);
await rejects({trustedPublicKey:keysOther.publicKey},/signature/);
await rejects({signature:"fake"},/signature/);
await rejects({receipt:{...receipt,deviceId:"d1000000-0000-4000-8000-000000000002"}},/device/);
await rejects({receipt:{...receipt,receiptId:"e1000000-0000-4000-8000-000000000002"}},/signature/);
await rejects({receipt:{...receipt,expiresAt:"2026-10-11T16:30:00.000Z"}},/15-minute/);
await rejects({receipt:{...receipt,issuedAt:"2026-02-30T15:59:00.000Z"}},/receipt.*invalid/);
await rejects({receipt:{...receipt,extraData:"should never be unsigned"}},/receipt.*invalid/);
const emptyDigest=await transfer.holidaySnapshotDigest([]);
const emptyReceipt={...receipt,snapshotSha256:emptyDigest};
await transfer.verifyHolidayTransferReceipt({
 ...args,receipt:emptyReceipt,signature:await sign(emptyReceipt),snapshot:[]
});
const src=fs.readFileSync("packages/business-logic/src/holiday-transfer-receipt.ts","utf8");
assert.doesNotMatch(src,/\b(?:hydrateHolidayCache|pgRpc|enqueueOutbox|setAttendance|assignRosterSlot)\s*\(/,
 "Crypto preflight must never import, save or replay holiday data");
const entry=fs.readFileSync("packages/business-logic/src/index.ts","utf8");
assert.match(entry,/export \* as holidayTransferReceipt from "\.\/holiday-transfer-receipt"/);
console.log("HR005 device-bound signed holiday receipt preflight and negative crypto/security cases PASS");
