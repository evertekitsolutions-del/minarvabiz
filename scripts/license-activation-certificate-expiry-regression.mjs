import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateKeyPairSync, sign, verify, createPublicKey } from "node:crypto";

const source = readFileSync(new URL("../infra/cloudflare-license-edge/src/index.js", import.meta.url), "utf8");
const start = source.indexOf("    let signedLicense = null;");
const end = source.indexOf("    return json(\n      { ...output, activationCertificate }", start);
assert.ok(start >= 0 && end > start, "Activation certificate expiry fix missing from Worker");

const execute = new (Object.getPrototypeOf(async function () {}).constructor)(
  "parsed", "authority", "nodeVerify", "createPublicKey", "Buffer", "output",
  "licenseId", "activationId", "validatedAt", "signActivationCertificateNatively", "json",
  source.slice(start, end) + "\nreturn activationCertificate;",
);
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const licenseId = "ab12345";
const deviceId = "a".repeat(64);
const activationId = "test-activation-id";
const originalExpiry = "2027-11-03T14:12:00.000Z";
const databaseExpiry = "2027-11-03T14:12:00+00:00";

function signedToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(null, Buffer.from(body), privateKey).toString("base64url");
  return `${body}.${signature}`;
}
async function run(payload, expiryInDb) {
  let signedCertificatePayload = null;
  const result = await execute(
    { licenseToken: signedToken(payload), deviceId }, { privateKey },
    verify, createPublicKey, Buffer,
    { expiresAt: expiryInDb }, licenseId, activationId, "2026-11-04T09:30:00Z",
    async (cert) => { signedCertificatePayload = cert; return signedToken(cert); },
    (data, status) => ({ ...data, status }),
  );
  return { result, signedCertificatePayload };
}

const license = { product: "minarvabiz", licenseId, expiresAt: originalExpiry };
const happy = await run(license, databaseExpiry);
assert.equal(happy.signedCertificatePayload.expiresAt, originalExpiry);
assert.equal(happy.signedCertificatePayload.licenseId, licenseId);
assert.equal(happy.signedCertificatePayload.deviceId, deviceId);
assert.equal(typeof happy.result, "string");

const mismatch = await run(license, "2027-11-05T14:12:00Z");
assert.equal(mismatch.result.code, "LICENSE_CERTIFICATE_MISMATCH");
assert.equal(mismatch.signedCertificatePayload, null);

const noExpiry = await run({ ...license, expiresAt: null }, null);
assert.equal(noExpiry.signedCertificatePayload.expiresAt, null);

console.log("Activation certificate signed expiry representation regression PASS");
