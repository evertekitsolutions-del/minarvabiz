import * as assert from "node:assert/strict";
import * as ed from "@noble/ed25519";
import { issueLicense } from "../issuer";
import { verifyLicenseToken, bytesToHex } from "../token";
import { validateLicenseLocally } from "../validate";

async function main() {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  const otherPrivateKey = ed.utils.randomPrivateKey();
  const otherPublicKey = await ed.getPublicKeyAsync(otherPrivateKey);
  const privateKeyHex = bytesToHex(privateKey);
  const publicKeyHex = bytesToHex(publicKey);
  const otherPublicKeyHex = bytesToHex(otherPublicKey);
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
  assert.equal(await verifyLicenseToken(issued.token, otherPublicKeyHex), null);

  const valid = await validateLicenseLocally(issued.token, publicKeyHex, deviceId);
  assert.equal(valid.valid, true);
  assert.equal(valid.payload?.licenseId, issued.payload.licenseId);

  const wrongDevice = await validateLicenseLocally(issued.token, publicKeyHex, otherDeviceId);
  assert.equal(wrongDevice.valid, false);
  assert.equal(wrongDevice.reason, "Device not activated for this license");

  const [body, signature] = issued.token.split(".");
  if (!body || !signature) throw new Error("Issued token was malformed");
  const replacement = body.endsWith("A") ? "B" : "A";
  const tamperedToken = `${body.slice(0, -1)}${replacement}.${signature}`;
  assert.equal(await verifyLicenseToken(tamperedToken, publicKeyHex), null);

  console.log("Licensing smoke PASS: Ed25519 issuance, signature verification, wrong-key rejection, device binding, and tamper rejection exercised.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
