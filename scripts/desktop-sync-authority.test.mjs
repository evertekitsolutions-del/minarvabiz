import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { generateKeyPairSync, sign } from "node:crypto";

const require = createRequire(import.meta.url);
const { verifyNativeDeviceAuthority } = require("../apps/desktop/electron/sync-authority.ts");
const domain = "MINARVA-BIZ:B1:SYNC-DEVICE-AUTHORITY:v1:";
const now = Date.UTC(2026, 9, 17, 10, 0, 0);
const DAY = 86_400_000;
const pair = generateKeyPairSync("ed25519");
const unrelated = generateKeyPairSync("ed25519");
const publicKeyHex = pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
const orgId = "10000000-0000-4000-8000-000000000001";
const otherOrgId = "20000000-0000-4000-8000-000000000001";
const deviceId = "30000000-0000-4000-8000-000000000001";
const actorUserId = "40000000-0000-4000-8000-000000000001";
const branchId = "50000000-0000-4000-8000-000000000001";
const secondBranchId = "50000000-0000-4000-8000-000000000002";
const credentialId = "60000000-0000-4000-8000-000000000001";

function payload(overrides = {}) {
  return {
    type: "minarvabiz-sync-device-authority-v1",
    version: 1,
    keyId: "sync-enrollment-test-1",
    credentialId,
    orgId,
    deviceId,
    actorUserId,
    role: "super_admin",
    allowedBranchIds: [branchId, secondBranchId],
    issuedAtMs: now - DAY,
    notBeforeMs: now - DAY,
    expiresAtMs: now + DAY,
    ...overrides,
  };
}
function token(record = payload(), privateKey = pair.privateKey, signingDomain = domain) {
  const body = Buffer.from(JSON.stringify(record)).toString("base64url");
  const signature = sign(null, Buffer.from(signingDomain + body), privateKey).toString("base64url");
  return body + "." + signature;
}
function context(overrides = {}) {
  return {
    trustedKeyId: "sync-enrollment-test-1",
    pinnedEd25519PublicKeyHex: publicKeyHex,
    expectedOrgId: orgId,
    expectedDeviceId: deviceId,
    expectedActorUserId: actorUserId,
    expectedBranchId: branchId,
    lastTrustedRevocationCheckMs: now - DAY,
    lastTrustedClockMs: now - DAY,
    nowMs: now,
    revokedCredentialIds: new Set(),
    ...overrides,
  };
}
const code = (value, ctx = context()) => {
  const outcome = verifyNativeDeviceAuthority(value, ctx);
  return outcome.ok ? "ok" : outcome.code;
};

test("accepts a valid domain-bound enrollment and freezes scope", () => {
  const outcome = verifyNativeDeviceAuthority(token(), context());
  assert.equal(outcome.ok, true);
  assert.equal(outcome.authority.orgId, orgId);
  assert.equal(outcome.authority.deviceId, deviceId);
  assert.equal(outcome.authority.role, "super_admin");
  assert.ok(Object.isFrozen(outcome.authority));
  assert.ok(Object.isFrozen(outcome.authority.allowedBranchIds));
  assert.equal(code(token(), context({ expectedBranchId: secondBranchId })), "ok");
});

test("signature and key trust do not borrow commercial license authority", () => {
  assert.equal(code(token(payload(), unrelated.privateKey)), "invalid_signature");
  assert.equal(code(token(payload(), pair.privateKey, "LICENSE:v1:")), "invalid_signature");
  assert.equal(code(token(), context({ trustedKeyId: "other-key" })), "invalid_signature");
  assert.equal(code(token(), context({ pinnedEd25519PublicKeyHex: "00".repeat(32) })), "invalid_signature");
  const good = token();
  const [body, sig] = good.split(".");
  assert.equal(code(Buffer.from(JSON.stringify({ ...payload(), role: "staff" })).toString("base64url") + "." + sig), "invalid_signature");
  assert.equal(code(body + "." + sig.slice(0, -1)), "invalid_token");
});

test("tenant, actor, native device and branch are all bound", () => {
  for (const ctx of [
    { expectedOrgId: otherOrgId },
    { expectedDeviceId: "30000000-0000-4000-8000-000000000002" },
    { expectedActorUserId: "40000000-0000-4000-8000-000000000002" },
    { expectedBranchId: "50000000-0000-4000-8000-000000000003" },
  ]) assert.equal(code(token(), context(ctx)), "scope_mismatch");
});

test("revoked, stale revocation data and clock rollback fail closed", () => {
  assert.equal(code(token(), context({ revokedCredentialIds: new Set([credentialId]) })), "revoked");
  assert.equal(code(token(), context({ revokedCredentialIds: new Set() ,lastTrustedRevocationCheckMs: now - 8 * DAY })), "revocation_stale");
  assert.equal(code(token(), context({ revokedCredentialIds: null })), "revocation_stale");
  assert.equal(code(token(), context({ lastTrustedClockMs: now + 6 * 60_000 })), "clock_untrusted");
  assert.equal(code(token(), context({ lastTrustedRevocationCheckMs: now + 1 })), "clock_untrusted");
});

test("expired, not-yet-valid and overlong credentials fail", () => {
  assert.equal(code(token(payload({ expiresAtMs: now }))), "expired");
  assert.equal(code(token(payload({ issuedAtMs: now + 100, notBeforeMs: now + 100 }))), "expired");
  assert.equal(code(token(payload({ issuedAtMs: now - 31 * DAY }))), "invalid_token");
  assert.equal(code(token(payload({ expiresAtMs: now + 31 * DAY }))), "invalid_token");
});

test("rejects malformed fields and branch grant ambiguity before trusting signatures", () => {
  for (const invalid of [
    { role: "root" },
    { keyId: "" },
    { version: 2 },
    { type: "minarvabiz-commercial-license" },
    { allowedBranchIds: [] },
    { allowedBranchIds: [branchId, branchId] },
    { allowedBranchIds: [secondBranchId, branchId] },
    { allowedBranchIds: ["wrong"] },
    { actorUserId: "wrong" },
    { expiresAtMs: Number.POSITIVE_INFINITY },
    { extraField: "hidden" },
  ]) assert.equal(code(token(payload(invalid))), "invalid_token", JSON.stringify(invalid));
  for (const malformed of [null, {}, "", "invalid", "one.two.three", "!!!.bad", "a".repeat(8193)]) {
    assert.equal(code(malformed), "invalid_token");
  }
});
