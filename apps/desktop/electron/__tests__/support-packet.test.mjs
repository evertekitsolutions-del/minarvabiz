import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
  fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path);
const { validateSupportPacketForExport, MAX_SUPPORT_PACKET_BYTES } = require("../support-packet.ts");
const good = JSON.stringify({
  format: "minarvabiz.support.v1", createdAt: "2026-10-23T12:00:00.000Z",
  type: "technical_escalation", title: "Printer not working", description: "No receipt",
  context: { appVersion: "1.0.15", diagnostics: null }, image: null, transcript: [],
});

test("native export validates known support JSON and returns original content", () => {
  assert.equal(validateSupportPacketForExport(good), good);
});

test("native export rejects empty, over-limit, invalid JSON and unknown keys", () => {
  assert.throws(() => validateSupportPacketForExport(""), /3 MB/);
  assert.throws(() => validateSupportPacketForExport("x".repeat(MAX_SUPPORT_PACKET_BYTES + 1)), /3 MB/);
  assert.throws(() => validateSupportPacketForExport("{"), /JSON/);
  assert.throws(() => validateSupportPacketForExport(JSON.stringify({ ...JSON.parse(good), licenseToken: "secret" })), /format/);
  assert.throws(() => validateSupportPacketForExport(JSON.stringify({ ...JSON.parse(good), description: "" })), /title and description/);
  assert.throws(() => validateSupportPacketForExport(JSON.stringify({ ...JSON.parse(good), image: "data:text/html;base64,AA" })), /screenshot/);
});
