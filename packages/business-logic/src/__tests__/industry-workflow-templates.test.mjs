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
const { listIndustryWorkflowTemplates, isIndustryWorkflowTransitionAllowed } =
  require("../industry-workflow-templates.ts");

test("no optional industry workflows are visible by default", () => {
  assert.deepEqual(listIndustryWorkflowTemplates(buildIndustryProfile(null, [])), []);
});

test("each selected industry only receives its own template", () => {
  const profile = buildIndustryProfile("restaurant", ["restaurant", "repair", "wholesale"]);
  const templates = listIndustryWorkflowTemplates(profile);
  assert.deepEqual(templates.map(item => item.industry), ["wholesale", "restaurant", "repair"]);
  assert.ok(templates.every(item => item.stages.length > 1));
  assert.equal(isIndustryWorkflowTransitionAllowed(profile, "repair-job", "received", "diagnosed"), true);
  assert.equal(isIndustryWorkflowTransitionAllowed(profile, "repair-job", "received", "handed-over"), false);
  assert.equal(isIndustryWorkflowTransitionAllowed(profile, "laundry-ticket", "received", "washing"), false);
  assert.equal(isIndustryWorkflowTransitionAllowed(profile, "repair-job", "bogus", "diagnosed"), false);
});

test("workflow results are immutable from registry caller's perspective", () => {
  const profile = buildIndustryProfile("laundry", ["laundry"]);
  const first = listIndustryWorkflowTemplates(profile);
  first[0].stages.push("corrupted");
  first[0].label = "corrupted";
  const next = listIndustryWorkflowTemplates(profile);
  assert.equal(next[0].label, "Laundry ticket");
  assert.ok(!next[0].stages.includes("corrupted"));
});

test("invalid or tampered industry profile cannot expose templates", () => {
  assert.throws(() => listIndustryWorkflowTemplates({
    version: 1, primary: null, enabled: ["not-an-industry"],
  }), /Unknown/);
  assert.throws(() => isIndustryWorkflowTransitionAllowed({
    version: 1, primary: "repair", enabled: ["laundry"],
  }, "repair-job", "received", "diagnosed"), /Primary/);
});

test("workflow module has no storage, accounting or licensing side effects", () => {
  const source = fs.readFileSync(new URL("../industry-workflow-templates.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|phase9Store|updateLicense|activateFeature|fetch\(|supabase|insert\(/);
});
