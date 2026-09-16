import * as assert from "node:assert/strict";
import * as ed from "@noble/ed25519";
import { issueLicense } from "../issuer";
import { signLicense, verifyLicenseToken, bytesToHex } from "../token";
import { validateLicenseLocally } from "../validate";

async function main() {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  const privateKeyHex = bytesToHex(privateKey);
  const publicKeyHex = bytesToHex(publicKey);
  const deviceId = "a".repeat(64);
  const otherDeviceId = "b".repeat(64);

  const issued = await issueLicense({
    customerName: "CI Customer",
    plan: "professional",
    edition: "offline",
    expiresAt: null,
    activationLimit: 1,
    deviceBindings: [deviceId],
    privateKeyHex,
  });

  assert.equal(issued.payload.product, "minarvabiz");
  assert.equal(issued.payload.plan, "professional");
  assert.deepEqual(issued.payload.deviceBindings, [deviceId]);
  assert.ok(await verifyLicenseToken(issued.token, publicKeyHex));

  const valid = await validateLicenseLocally(issued.token, publicKeyHex, deviceId);
  assert.equal(valid.valid, true);
  assert.equal(valid.payload?.licenseId, issued.payload.licenseId);

  const wrongDevice = await validateLicenseLocally(issued.token, publicKeyHex, otherDeviceId);
  assert.equal(wrongDevice.valid, false);
  assert.equal(wrongDevice.reason, "Device not activated for this license");

  const tamperedPayload = { ...issued.payload, customerId: "00000000-0000-0000-0000-000000000000" };
  const tamperedToken = await signLicense(tamperedPayload, privateKeyHex);
  assert.equal((await verifyLicenseToken(tamperedToken, publicKeyHex))?.customerId, "00000000-0000-0000-0000-000000000000");
  assert.equal(tamperedToken === issued.token, false);

  console.log("Licensing smoke PASS: Ed25519 issuance/verification, device binding, and tamper detection exercised.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
