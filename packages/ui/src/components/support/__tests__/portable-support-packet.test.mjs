import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
  fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path);
const { createPortableSupportPacket, canUseSupportApi } = require("../portable-support-packet.ts");
const context = { appVersion: "1.0.15", edition: "offline", diagnostics: null };

test("offline desktop never contacts an unconfigured or arbitrary support provider", () => {
  assert.equal(canUseSupportApi("", true), false);
  assert.equal(canUseSupportApi("file:///api/support", true), false);
  assert.equal(canUseSupportApi("https://support.customer-owned.example", true), true);
  assert.equal(canUseSupportApi("", false), true); // same-origin web route
});

test("portable support export does not add diagnostics, database contents or token fields", () => {
  const data = JSON.parse(createPortableSupportPacket({
    type: "suggestion", title: "   Improve POS   ", description: " Please add SKU search ",
    context,
  }, new Date("2026-10-23T00:00:00.000Z")));
  assert.equal(data.format, "minarvabiz.support.v1");
  assert.equal(data.title, "Improve POS");
  assert.equal(data.context.diagnostics, null);
  assert.deepEqual(data.transcript, []);
  assert.equal(data.createdAt, "2026-10-23T00:00:00.000Z");
  assert.equal("deviceId" in data.context, false);
});

test("large screenshot and invalid content fail before export", () => {
  const base = { type: "feature_request", title: "T", description: "D", context };
  assert.throws(() => createPortableSupportPacket({ ...base, image: "data:image/png;base64,AAA" }), /screenshot/i);
  assert.throws(() => createPortableSupportPacket({ ...base, image: "data:image/jpeg;base64," + "a".repeat(2_600_000) }), /screenshot/i);
  assert.throws(() => createPortableSupportPacket({ ...base, description: "" }), /title and description/i);
  assert.throws(() => createPortableSupportPacket({ ...base, transcript: [{ role: "user", content: "x".repeat(4_001) }] }), /conversation/i);
});
