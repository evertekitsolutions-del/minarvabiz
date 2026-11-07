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
const { commitAuthorizedIndustryWorkflowBatch } = require("../industry-workflow-commit.ts");
const profile = buildIndustryProfile("restaurant", ["restaurant"]);
const record = createIndustryWorkflowRecord(profile, {
  id: "order-1", tenantId: "tenant-1", branchId: "branch-1", templateId: "restaurant-ticket",
});
const event = { eventId: "e1", tenantId: "tenant-1", branchId: "branch-1",
  expectedRevision: 0, from: "placed", to: "preparing" };
const access = { actorId: "staff-1", tenantId: "tenant-1", branchId: "branch-1",
  allowedTemplateIds: ["restaurant-ticket"],
  allowedTransitions: [{ templateId: "restaurant-ticket", from: "placed", to: "preparing" }] };
const transaction = { record, events: [event], access };

test("requires successful durable acknowledgement before reporting transition", async () => {
  let called = 0;
  const result = await commitAuthorizedIndustryWorkflowBatch(profile, transaction, {
    async commit({ original, next, events, access: trusted }) {
      called++;
      assert.equal(original.revision, 0);
      assert.equal(events[0].eventId, "e1");
      assert.equal(trusted.actorId, "staff-1");
      return next;
    },
  });
  assert.equal(called, 1);
  assert.equal(result.revision, 1);
  assert.equal(record.revision, 0);
});

test("rejects mismatched, missing and rejected storage acknowledgement", async () => {
  await assert.rejects(commitAuthorizedIndustryWorkflowBatch(profile, transaction,
    { commit: async ({ next }) => ({ ...next, revision: 0 }) }), /acknowledgement mismatch/);
  await assert.rejects(commitAuthorizedIndustryWorkflowBatch(profile, transaction,
    { commit: async () => null }), /acknowledgement mismatch/);
  await assert.rejects(commitAuthorizedIndustryWorkflowBatch(profile, transaction,
    { commit: async () => { throw new Error("offline"); } }), /offline/);
});

test("denied command never invokes the storage adapter", async () => {
  let writes = 0;
  await assert.rejects(commitAuthorizedIndustryWorkflowBatch(profile,
    { ...transaction, access: { ...access, branchId: "foreign" } },
    { commit: async () => { writes++; return record; } }), /scope mismatch/);
  assert.equal(writes, 0);
});


test("rejects adapter mutation of the expected workflow acknowledgement", async () => {
  await assert.rejects(commitAuthorizedIndustryWorkflowBatch(profile, transaction, {
    async commit({ next }) {
      next.appliedEventIds[0] = "forged-event";
      return next;
    },
  }), /read only|Cannot assign|acknowledgement mismatch/);
});

test("adapter cannot mutate caller records, events, or authorization grants", async () => {
  const originalEvent = { ...event };
  const originalAccess = structuredClone(access);
  const originalRecord = structuredClone(record);
  await assert.rejects(commitAuthorizedIndustryWorkflowBatch(profile, transaction, {
    async commit({ original, events, access: grants }) {
      original.appliedEventIds.push("forged");
      events[0].eventId = "forged";
      grants.allowedTemplateIds.push("foreign-template");
      return original;
    },
  }));
  assert.deepEqual(event, originalEvent);
  assert.deepEqual(access, originalAccess);
  assert.deepEqual(record, originalRecord);
});
