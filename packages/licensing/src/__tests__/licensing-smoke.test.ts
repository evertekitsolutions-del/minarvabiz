import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as ed from "@noble/ed25519";
import { issueLicense } from "../issuer";
import { verifyLicenseToken, signLicense, bytesToHex } from "../token";
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

  const now = Date.now();
  const day = 86400000;
  const expiredPayload = {
    ...issued.payload,
    issuedAt: new Date(now - 30 * day).toISOString(),
    expiresAt: new Date(now - day).toISOString(),
  };
  const expiredToken = await signLicense(expiredPayload, privateKeyHex);
  const grace = await validateLicenseLocally(expiredToken, publicKeyHex, deviceId, {
    graceDays: 7,
    lastOnlineValidation: new Date(now - 20 * day).toISOString(),
  });
  assert.equal(grace.valid, true);
  assert.equal(grace.inGrace, true);
  assert.equal(grace.daysRemaining, 0);
  assert.ok((grace.graceDaysRemaining ?? 0) >= 5, "Post-expiry grace should not be shortened by a stale pre-expiry validation");

  const graceWrongDevice = await validateLicenseLocally(expiredToken, publicKeyHex, otherDeviceId, {
    graceDays: 7,
    lastOnlineValidation: new Date(now - 20 * day).toISOString(),
  });
  assert.equal(graceWrongDevice.valid, false);
  assert.equal(graceWrongDevice.reason, "Device not activated for this license");

  const longExpiredPayload = {
    ...expiredPayload,
    expiresAt: new Date(now - 10 * day).toISOString(),
  };
  const longExpiredToken = await signLicense(longExpiredPayload, privateKeyHex);
  const ended = await validateLicenseLocally(longExpiredToken, publicKeyHex, deviceId, {
    graceDays: 7,
    lastOnlineValidation: new Date(now - 20 * day).toISOString(),
  });
  assert.equal(ended.valid, false);
  assert.equal(ended.reason, "License expired and grace period ended");

  const sharedLifecycle = fs.readFileSync(new URL("../activation.ts", import.meta.url), "utf8");
  assert.match(sharedLifecycle, /status: inGrace \? "grace"/);
  assert.match(sharedLifecycle, /graceDaysRemaining: inGrace \? result\.graceDaysRemaining/);

  const desktopLicense = fs.readFileSync(new URL("../../../../apps/desktop/electron/license.ts", import.meta.url), "utf8");
  assert.match(desktopLicense, /Math\.max\(expires, lastOnline\)/);

  console.log("Licensing smoke PASS: Ed25519 issuance, signature verification, device binding, tamper rejection, and post-expiry grace semantics exercised.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
