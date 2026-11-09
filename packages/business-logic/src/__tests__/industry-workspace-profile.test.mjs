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
const {
  listIndustryPacks, buildIndustryProfile, validateIndustryProfile,
  industryPreferenceKey, readIndustryProfile, writeIndustryProfile,
} = require("../industry-workspace-profile.ts");

test("all industries are optional; no boutique or other global default", () => {
  assert.equal(readIndustryProfile({ getItem: () => null }, "minarva:industry-profile:v1:live:u:b").primary, null);
  const packs = listIndustryPacks();
  assert.ok(packs.length >= 10);
  assert.ok(packs.some(p => p.id === "restaurant"));
  assert.ok(packs.some(p => p.id === "manufacturing"));
  assert.ok(packs.some(p => p.id === "repair"));
});

test("mixed-business profile remains deterministic and rejects invalid IDs", () => {
  const profile = buildIndustryProfile("restaurant", ["repair", "restaurant"]);
  assert.deepEqual(profile.enabled, ["restaurant", "repair"]);
  assert.equal(profile.primary, "restaurant");
  assert.throws(() => validateIndustryProfile({ version: 1, primary: "restaurant", enabled: ["repair"] }), /Primary industry/);
  assert.throws(() => validateIndustryProfile({ version: 1, primary: null, enabled: ["retail", "retail"] }), /duplicate/);
  assert.throws(() => validateIndustryProfile({ version: 1, primary: null, enabled: ["unlicensed-custom-pack"] }), /Unknown/);
  assert.throws(() => validateIndustryProfile({ version: 2, primary: null, enabled: [] }), /Unsupported/);
});

test("preferences are scoped by user, branch and demo mode; no anonymous shared key", () => {
  assert.equal(industryPreferenceKey(null, "b", false), null);
  assert.equal(industryPreferenceKey("u", null, false), null);
  assert.notEqual(industryPreferenceKey("u", "b1", false), industryPreferenceKey("u", "b2", false));
  assert.notEqual(industryPreferenceKey("u", "b1", false), industryPreferenceKey("u", "b1", true));
  assert.notEqual(industryPreferenceKey("u:a", "b", false), industryPreferenceKey("u", "a:b", false));
});

test("save failures do not claim persistence; malformed stored data fails closed", () => {
  const key = industryPreferenceKey("user", "branch", false);
  const map = new Map();
  const storage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  const profile = buildIndustryProfile("pharmacy", ["pharmacy", "retail"]);
  writeIndustryProfile(storage, key, profile);
  assert.deepEqual(readIndustryProfile(storage, key), profile);
  map.set(key, '{"version":1,"primary":"retail","enabled":["other"]}');
  assert.throws(() => readIndustryProfile(storage, key), /Unknown/);
  assert.throws(() => writeIndustryProfile({ setItem: () => { throw new Error("quota"); } }, key, profile), /quota/);
  assert.throws(() => writeIndustryProfile(storage, "wrong-key", profile), /scope/);
});

test("web selector is opt-in and does not call financial, licensing or module activation writers", () => {
  const page = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/settings/industry/page.tsx", import.meta.url), "utf8");
  assert.match(page, /industryPreferenceKey/);
  assert.match(page, /writeIndustryProfile/);
  assert.match(page, /branch/);
  assert.doesNotMatch(page, /updateLicense|activateFeature|updateShopProfile|updateTaxConfig/);
});

test("preference storage rejects forged, empty and malformed scope keys", () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error("should not write"); } };
  const profile = buildIndustryProfile(null, []);
  const invalid = [
    "minarva:industry-profile:v1:",
    "minarva:industry-profile:v1:live::branch",
    "minarva:industry-profile:v1:live:user:",
    "minarva:industry-profile:v1:live:user:branch:extra",
    "minarva:industry-profile:v1:admin:user:branch",
    "minarva:industry-profile:v1:live:%ZZ:branch",
    "minarva:industry-profile:v1:live:%20:branch",
    "minarva:industry-profile:v1:live:user:%20",
    "minarva:industry-profile:v1:live:%75ser:branch",
  ];
  for (const key of invalid) {
    assert.throws(() => readIndustryProfile(storage, key), /scope/, key);
    assert.throws(() => writeIndustryProfile(storage, key, profile), /scope/, key);
  }
  const valid = industryPreferenceKey("tenant:user", "branch / 2", false);
  assert.equal(readIndustryProfile(storage, valid).primary, null);
});


test("industry preview stays in memory and never commits workflow events", () => {
  const page = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/settings/industry/page.tsx", import.meta.url), "utf8");
  assert.match(page, /previewStages/);
  assert.match(page, /Preview next stage/);
  assert.match(page, /Reset preview/);
  assert.match(page, /in-memory workflow previews only/);
  assert.doesNotMatch(page, /applyIndustryWorkflowEvent|persistIndustryWorkflow|createIndustryWorkflowRecord/);
});
