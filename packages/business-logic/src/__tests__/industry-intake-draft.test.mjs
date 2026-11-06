import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
const { buildIndustryProfile } = require("../industry-workspace-profile.ts");
const { saveIndustryIntakeDraft, readIndustryIntakeDraft } = require("../industry-intake-draft.ts");
const profile = buildIndustryProfile("repair", ["repair", "restaurant"]);
const scope = "minarva:industry-profile:v1:live:operator:branch";
const now = "2026-11-07T00:00:00.000Z";
test("scoped industry intake reference survives readback", () => {
  const values = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const saved = saveIndustryIntakeDraft(storage, scope, profile, "repair-job", "JOB-17", now);
  assert.deepEqual(readIndustryIntakeDraft(storage, scope, profile, "repair-job"), saved);
  assert.equal(readIndustryIntakeDraft(storage, scope, profile, "restaurant-ticket"), null);
});
test("disabled pack, malformed references and invalid scopes fail closed", () => {
  const storage = { getItem: () => null, setItem: () => {} };
  assert.throws(() => saveIndustryIntakeDraft(storage, scope, profile, "laundry-ticket", "TAG-1", now));
  assert.throws(() => saveIndustryIntakeDraft(storage, scope, profile, "repair-job", "name@example.com", now));
  assert.throws(() => saveIndustryIntakeDraft(storage, "unscoped", profile, "repair-job", "JOB-1", now));
  assert.throws(() => saveIndustryIntakeDraft(storage, scope, profile, "repair-job", "JOB-1", "invalid"));
});
test("storage acknowledgement without durable readback is rejected", () => {
  assert.throws(() => saveIndustryIntakeDraft({ getItem: () => null, setItem: () => {} }, scope, profile, "repair-job", "JOB-1", now), /persist/);
});
