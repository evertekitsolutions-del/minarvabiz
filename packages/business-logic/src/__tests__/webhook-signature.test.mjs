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
const { signWebhookDelivery } = require("../webhook-signature.ts");
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
