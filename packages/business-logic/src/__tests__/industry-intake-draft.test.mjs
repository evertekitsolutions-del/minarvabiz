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
const { saveIndustryIntakeDraft, readIndustryIntakeDraft, deleteIndustryIntakeDraft } = require("../industry-intake-draft.ts");
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

test("operator can delete only selected scoped draft with verified readback", () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  saveIndustryIntakeDraft(storage, scope, profile, "repair-job", "JOB-19", now);
  saveIndustryIntakeDraft(storage, scope, profile, "restaurant-ticket", "TABLE-4", now);
  assert.equal(deleteIndustryIntakeDraft(storage, scope, profile, "repair-job"), true);
  assert.equal(readIndustryIntakeDraft(storage, scope, profile, "repair-job"), null);
  assert.equal(readIndustryIntakeDraft(storage, scope, profile, "restaurant-ticket")?.reference, "TABLE-4");
  assert.equal(deleteIndustryIntakeDraft(storage, scope, profile, "repair-job"), false);
  assert.throws(() => deleteIndustryIntakeDraft(storage, scope, profile, "laundry-ticket"));
});
test("failed local draft deletion never reports success", () => {
  const storage = { getItem: () => "stale", removeItem: () => {} };
  assert.throws(() => deleteIndustryIntakeDraft(storage, scope, profile, "repair-job"), /not confirmed/);
});

test("older tab cannot overwrite a newer scoped reference", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  saveIndustryIntakeDraft(storage, scope, profile, "repair-job", "NEW-REF", "2026-11-07T01:00:00.000Z");
  assert.throws(() => saveIndustryIntakeDraft(storage, scope, profile, "repair-job", "STALE-REF", now), /conflicting saved revision/);
  assert.equal(readIndustryIntakeDraft(storage, scope, profile, "repair-job")?.reference, "NEW-REF");
  assert.equal(readIndustryIntakeDraft(storage, scope, profile, "restaurant-ticket"), null);
});

test("noncanonical and impossible timestamps are rejected", () => {
  const storage = { getItem: () => null, setItem: () => {} };
  for (const timestamp of ["2026-11-07T00:00:00Z", "2026-02-30T00:00:00.000Z", "2026-11-07T00:00:00.000+00:00"]) {
    assert.throws(() => saveIndustryIntakeDraft(storage, scope, profile, "repair-job", "JOB-1", timestamp), /timestamp/);
  }
});


test("same-millisecond conflicting tab save is rejected without overwriting reference", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  saveIndustryIntakeDraft(storage, scope, profile, "repair-job", "FIRST", now);
  assert.throws(() => saveIndustryIntakeDraft(storage, scope, profile, "repair-job", "SECOND", now), /conflicting saved revision/);
  assert.equal(readIndustryIntakeDraft(storage, scope, profile, "repair-job")?.reference, "FIRST");
  assert.equal(saveIndustryIntakeDraft(storage, scope, profile, "repair-job", "FIRST", now).reference, "FIRST");
});
