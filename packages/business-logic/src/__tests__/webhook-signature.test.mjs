import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, webcrypto } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename,
);
const { signWebhookDelivery, verifyWebhookDelivery, verifyWebhookDeliveryWithRotation } = require("../webhook-signature.ts");
// Deterministic synthetic HMAC key; never a production credential.
const secret = "fixture-only-".repeat(4);
const input = { eventId: "evt_123", eventType: "invoice.paid", timestamp: 1794000000,
  payload: { invoiceId: "inv_1" }, secret, cryptoProvider: webcrypto };
test("signs exact serialized envelope with independently verifiable HMAC", async () => {
  const result = await signWebhookDelivery(input);
  const expected = createHmac("sha256", secret).update(`${input.timestamp}.${result.body}`).digest("hex");
  assert.equal(result.headers["x-minarva-signature"], `v1=${expected}`);
  assert.equal(result.headers["x-minarva-event-id"], input.eventId);
  assert.equal(JSON.parse(result.body).data.invoiceId, "inv_1");
  assert.ok(!JSON.stringify(result).includes(secret));
});
test("rejects weak secrets, invalid identifiers and oversized payloads", async () => {
  for (const changed of [
    { secret: "weak" }, { eventId: "../cross-tenant" }, { timestamp: -1 },
    { eventType: "invalid" }, { payload: { text: "x".repeat(262145) } },
  ]) await assert.rejects(signWebhookDelivery({ ...input, ...changed }));
});
test("rejects unavailable crypto rather than emitting unsigned payloads", async () => {
  await assert.rejects(signWebhookDelivery({ ...input, cryptoProvider: {} }));
});

test("receiver verifies signature, rejects tampering and stale or future timestamps", async () => {
  const signed = await signWebhookDelivery(input);
  const candidate = { body: signed.body, timestamp: signed.headers["x-minarva-timestamp"],
    signature: signed.headers["x-minarva-signature"], secret,
    nowSeconds: input.timestamp, cryptoProvider: webcrypto };
  assert.equal(await verifyWebhookDelivery(candidate), true);
  for (const change of [
    { body: signed.body + " " },
    { signature: "v1=" + "0".repeat(64) },
    { timestamp: String(input.timestamp + 1) },
    { nowSeconds: input.timestamp + 301 },
    { nowSeconds: input.timestamp - 301 },
    { secret: "invalid" },
    { toleranceSeconds: 3601 },
  ]) assert.equal(await verifyWebhookDelivery({ ...candidate, ...change }), false);
});

test("rotation accepts previous key only before explicit cutoff, rejects after expiry", async () => {
  const signed = await signWebhookDelivery(input);
  const candidate = {
    body: signed.body, timestamp: signed.headers["x-minarva-timestamp"],
    signature: signed.headers["x-minarva-signature"],
    activeSecret: "new-fixture-".repeat(4), previousSecret: secret,
    previousKeyValidUntilSeconds: input.timestamp + 100,
    nowSeconds: input.timestamp, cryptoProvider: webcrypto,
  };
  assert.equal(await verifyWebhookDeliveryWithRotation(candidate), true);
  assert.equal(await verifyWebhookDeliveryWithRotation({
    ...candidate, nowSeconds: input.timestamp + 101,
  }), false);
  assert.equal(await verifyWebhookDeliveryWithRotation({
    ...candidate, previousKeyValidUntilSeconds: undefined,
  }), false);
  assert.equal(await verifyWebhookDeliveryWithRotation({
    ...candidate, previousSecret: undefined,
  }), false);
  assert.equal(await verifyWebhookDeliveryWithRotation({
    ...candidate, activeSecret: secret, previousSecret: undefined,
  }), true);
});
