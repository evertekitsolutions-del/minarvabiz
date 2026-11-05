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
const { createIndustryWorkflowRecord, applyIndustryWorkflowEvent } =
  require("../industry-workflow-reducer.ts");

const profile = buildIndustryProfile("restaurant", ["restaurant", "repair"]);
const scope = { id: "ticket-1", tenantId: "tenant-A", branchId: "branch-1", templateId: "restaurant-ticket" };
const event = { eventId: "event-1", tenantId: scope.tenantId, branchId: scope.branchId, expectedRevision: 0, from: "placed", to: "preparing" };

test("opt-in workflow starts at first stage and transitions with revision", () => {
  const record = createIndustryWorkflowRecord(profile, scope);
  assert.equal(record.stage, "placed");
  const updated = applyIndustryWorkflowEvent(profile, record, event);
  assert.equal(updated.stage, "preparing");
  assert.equal(updated.revision, 1);
  assert.deepEqual(updated.appliedEventIds, ["event-1"]);
  assert.equal(record.revision, 0);
  assert.equal(applyIndustryWorkflowEvent(profile, updated, event), updated);
});

test("tenant and branch scope cannot be replayed across locations", () => {
  const record = createIndustryWorkflowRecord(profile, scope);
  assert.throws(() => applyIndustryWorkflowEvent(profile, record, { ...event, tenantId: "tenant-B" }), /scope mismatch/);
  assert.throws(() => applyIndustryWorkflowEvent(profile, record, { ...event, branchId: "branch-2" }), /scope mismatch/);
});

test("stale revisions, skipped stages and conflicting replays fail closed", () => {
  const record = createIndustryWorkflowRecord(profile, scope);
  assert.throws(() => applyIndustryWorkflowEvent(profile, record, { ...event, expectedRevision: 1 }), /Stale/);
  assert.throws(() => applyIndustryWorkflowEvent(profile, record, { ...event, to: "served" }), /Invalid industry/);
  const updated = applyIndustryWorkflowEvent(profile, record, event);
  assert.throws(() => applyIndustryWorkflowEvent(profile, updated, { ...event, to: "ready" }), /Conflicting/);
  assert.throws(() => applyIndustryWorkflowEvent(profile, updated, { ...event, eventId: "event-2" }), /Stale/);
});

test("unselected workflow cannot be created or advanced", () => {
  const record = createIndustryWorkflowRecord(profile, scope);
  assert.throws(() => createIndustryWorkflowRecord(profile, { ...scope, templateId: "laundry-ticket" }), /not selected/);
  assert.throws(() => applyIndustryWorkflowEvent(buildIndustryProfile(null, []), record, event), /not selected/);
});

test("invalid identities and tampered revision history are rejected", () => {
  assert.throws(() => createIndustryWorkflowRecord(profile, { ...scope, branchId: "" }), /scope/);
  const record = createIndustryWorkflowRecord(profile, scope);
  assert.throws(() => applyIndustryWorkflowEvent(profile, { ...record, revision: -1 }, event), /revision history/);
  assert.throws(() => applyIndustryWorkflowEvent(profile, { ...record, appliedEventIds: ["same", "same"] }, event), /revision history/);
});

test("reducer has no I/O, license or stock side effects", () => {
  const src = fs.readFileSync(new URL("../industry-workflow-reducer.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /localStorage|phase9Store|supabase|fetch\(|insert\(|updateLicense|postJournal/);
});
