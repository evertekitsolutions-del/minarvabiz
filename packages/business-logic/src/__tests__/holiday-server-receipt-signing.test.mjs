import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { generateKeyPairSync, webcrypto } from "node:crypto";
const require = createRequire(import.meta.url), ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true, inlineSourceMap: true, inlineSources: true,
    },
  }).outputText, filename,
);
const verifier = require("../holiday-device-receipt.ts");
const { verifyHolidayDeviceSnapshot, holidayDeviceSnapshotSigningBytes } = verifier;
const NodeModule = require("node:module");
const serverPath = path.resolve("apps/web/src/lib/hr005-holiday-receipt-signing.server.ts");
const serverSource = fs.readFileSync(serverPath, "utf8");
const mod = new NodeModule(serverPath);
mod.filename = serverPath;
mod.paths = NodeModule._nodeModulePaths(path.dirname(serverPath));
const realRequire = createRequire(serverPath);
// The only mocked edges are the Next.js server-only import marker and the
// already separately regression-tested workspace package namespace.
mod.require = id => id === "server-only" ? {} :
  id === "@minarvabiz/business-logic" ? { holidayDeviceReceipt: verifier } :
    realRequire(id);
mod._compile(ts.transpileModule(serverSource, {
  fileName: serverPath, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText, serverPath);
const { signHolidaySnapshotDraftServerOnly: issueDraft } = mod.exports;
const orgId = "10000000-0000-4000-8000-000000000001";
const otherOrg = "20000000-0000-4000-8000-000000000002";
const deviceId = "a0000000-0000-4000-8000-000000000001";
const time = Date.UTC(2026, 9, 12, 12, 0, 0);
const rule = {
  id: "a5000000-0000-4000-8000-000000000001", orgId,
  scope: "branch", branchId: "b0000000-0000-4000-8000-000000000001",
  countryCode: null, date: "2026-10-12", repeatsAnnually: false,
  name: "Authorized staff holiday", treatment: "non_working", active: true, version: 1,
};
const payload = {
  schemaVersion: 1, snapshotId: "c0000000-0000-4000-8000-000000000001",
  orgId, deviceId, sequence: 9,
  issuedAt: time - 1000, expiresAt: time + 60_000, rules: [rule],
};
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicRaw = new Uint8Array(publicKey.export({type:"spki",format:"der"}).subarray(-32));
const params = { privateKey, expectedPinnedPublicKey: publicRaw, trustedNowMs: time };
const inputBefore = structuredClone(payload);
const draft = issueDraft({ ...params, payload });
const received = await verifyHolidayDeviceSnapshot({
  packet: draft, expectedOrgId: orgId, expectedDeviceId: deviceId,
  lastAcceptedSequence: 8, nowMs: time,
  pinnedEd25519PublicKey: publicRaw, subtle: webcrypto.subtle,
});
assert.equal(received.sequence, 9);
assert.deepEqual(received.rules, [rule]);
assert.deepEqual(payload, inputBefore, "Signer does not mutate caller snapshot");
assert.equal(typeof draft.signatureBase64, "string");
assert.equal(draft.signatureBase64.length, 88);
assert.deepEqual(draft.payload, payload);
assert.ok(holidayDeviceSnapshotSigningBytes(draft.payload).length > 100);

// Canonical normalization strips unknown unsigned extension fields.
const withExtra = issueDraft({ ...params, payload: { ...payload, customUntrustedProperty: "ignored" } });
assert.equal(Object.hasOwn(withExtra.payload, "customUntrustedProperty"), false);
await verifyHolidayDeviceSnapshot({
  packet: withExtra, expectedOrgId: orgId, expectedDeviceId: deviceId,
  lastAcceptedSequence: 8, nowMs: time,
  pinnedEd25519PublicKey: publicRaw, subtle: webcrypto.subtle,
});

// Fail closed on private-key mismatch, incorrect pinned key, clock mismatch,
// malformed/mixed-tenant/duplicate snapshots and invalid signer object.
const other = generateKeyPairSync("ed25519");
for (const bad of [
  { ...params, privateKey: other.privateKey, payload },
  { ...params, privateKey: publicKey, payload },
  { ...params, privateKey: "FAKE_PRIVATE_KEY", payload },
  { ...params, expectedPinnedPublicKey: new Uint8Array(32), payload },
  { ...params, expectedPinnedPublicKey: new Uint8Array(), payload },
  { ...params, trustedNowMs: time + 3600_000, payload },
  { ...params, trustedNowMs: Number.NaN, payload },
  { ...params, payload: { ...payload, rules: [rule, rule] } },
  { ...params, payload: { ...payload, rules: [{ ...rule, orgId: otherOrg }] } },
  { ...params, payload: { ...payload, sequence: 0 } },
  { ...params, payload: { ...payload, expiresAt: time + 16 * 60_000 } },
]) assert.throws(() => issueDraft(bad),
  /Ed25519|trusted|Signer|holiday|snapshot|duplicate|Cross-tenant|issuance/i);

// Bytes are bound to precise fields. A recipient refuses tampered content.
const edited = structuredClone(draft);
edited.payload.rules[0].name = "Remote unapproved edit";
await assert.rejects(verifyHolidayDeviceSnapshot({
  packet: edited, expectedOrgId: orgId, expectedDeviceId: deviceId,
  lastAcceptedSequence: 8, nowMs: time,
  pinnedEd25519PublicKey: publicRaw, subtle: webcrypto.subtle,
}), /signature/i);
assert.match(serverSource, /^import "server-only";/);
assert.doesNotMatch(serverSource,
  /process\.env|localStorage|fetch\(|pgRpc\(|hydrateHolidayCache\(|saveAttendance\(|enqueueOutbox\(|console\.log\(/,
  "Server-only signing kernel cannot read production secrets, make network calls or mutate customer state");
assert.doesNotMatch(serverSource, /export (async )?function (POST|GET)|NextResponse|NextRequest/,
  "Source kernel must not expose any public HTTP route");
console.log("HR005K: genuine server-only Ed25519 signer/verifier roundtrip, pinned keys, tamper and NO DEPLOY PASS");
