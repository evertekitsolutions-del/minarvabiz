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
const { createIndustryWorkflowRecord } = require("../industry-workflow-reducer.ts");
const { applyAuthorizedIndustryWorkflowEvent } = require("../industry-workflow-access.ts");

const profile = buildIndustryProfile("restaurant", ["restaurant", "repair"]);
const scope = { id: "ticket-1", tenantId: "tenant-A", branchId: "branch-1", templateId: "restaurant-ticket" };
const event = { eventId: "event-1", tenantId: "tenant-A", branchId: "branch-1", expectedRevision: 0, from: "placed", to: "preparing" };
const grant = { actorId: "operator-1", tenantId: "tenant-A", branchId: "branch-1",
  allowedTemplateIds: ["restaurant-ticket"],
  allowedTransitions: [{ templateId: "restaurant-ticket", from: "placed", to: "preparing" }] };

test("explicit trusted grant permits only selected workflow transition", () => {
  const initial = createIndustryWorkflowRecord(profile, scope);
  const result = applyAuthorizedIndustryWorkflowEvent(profile, initial, event, grant);
  assert.equal(result.stage, "preparing");
  assert.equal(result.revision, 1);
  assert.equal(initial.revision, 0);
});

test("missing actor, absent grants and mismatched scope deny without mutation", () => {
  const initial = createIndustryWorkflowRecord(profile, scope);
  assert.throws(() => applyAuthorizedIndustryWorkflowEvent(profile, initial, event, { ...grant, actorId: "" }), /authorization required/);
  assert.throws(() => applyAuthorizedIndustryWorkflowEvent(profile, initial, event, { ...grant, allowedTemplateIds: [] }), /not authorized/);
  assert.throws(() => applyAuthorizedIndustryWorkflowEvent(profile, initial, event, { ...grant, allowedTransitions: [] }), /not authorized/);
  assert.throws(() => applyAuthorizedIndustryWorkflowEvent(profile, initial, event, { ...grant, branchId: "other" }), /scope mismatch/);
  assert.throws(() => applyAuthorizedIndustryWorkflowEvent(profile, initial, { ...event, tenantId: "other" }, grant), /scope mismatch/);
  assert.equal(initial.stage, "placed");
});

test("grant cannot authorize a skipped transition or unselected pack", () => {
  const initial = createIndustryWorkflowRecord(profile, scope);
  const forged = { ...event, to: "served" };
  const widerGrant = { ...grant, allowedTransitions: [{ templateId: "restaurant-ticket", from: "placed", to: "served" }] };
  assert.throws(() => applyAuthorizedIndustryWorkflowEvent(profile, initial, forged, widerGrant), /Invalid industry workflow transition/);
  assert.throws(() => applyAuthorizedIndustryWorkflowEvent(buildIndustryProfile(null, []), initial, event, grant), /not selected/);
});

test("authorization boundary contains no I/O, payments or entitlement side effects", () => {
  const src = fs.readFileSync(new URL("../industry-workflow-access.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /localStorage|supabase|fetch\(|postJournal|insert\(|updateLicense/);
});
