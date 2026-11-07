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
const { INDUSTRY_WORKFLOW_SQLITE_SCHEMA, createIndustrySqliteCommitPort } =
  require("../industry-workflow-sqlite.ts");

test("SQLite schema scopes records and unique event identities per tenant and branch", () => {
  assert.match(INDUSTRY_WORKFLOW_SQLITE_SCHEMA, /PRIMARY KEY \(tenant_id, branch_id, record_id\)/);
  assert.match(INDUSTRY_WORKFLOW_SQLITE_SCHEMA, /PRIMARY KEY \(tenant_id, branch_id, record_id, event_id\)/);
  assert.match(INDUSTRY_WORKFLOW_SQLITE_SCHEMA, /UNIQUE \(tenant_id, branch_id, record_id, revision\)/);
  assert.match(INDUSTRY_WORKFLOW_SQLITE_SCHEMA, /actor_id TEXT NOT NULL/);
});

test("refuses missing trusted transaction database", () => {
  assert.throws(() => createIndustrySqliteCommitPort(null), /Trusted SQLite/);
  assert.throws(() => createIndustrySqliteCommitPort({ prepare() {} }), /Trusted SQLite/);
});

test("rejects cross-branch commit before SQL and transaction begins", async () => {
  let queries = 0;
  let transactions = 0;
  const port = createIndustrySqliteCommitPort({
    prepare() { queries++; throw new Error("should not execute SQL"); },
    transaction() { transactions++; throw new Error("should not transact"); },
  });
  const original = { id: "job-1", tenantId: "t1", branchId: "b1",
    templateId: "repair-job", stage: "received", revision: 0, appliedEventIds: [] };
  await assert.rejects(port.commit({
    original, next: { ...original, branchId: "b2", revision: 1 },
    events: [{ eventId: "e1", tenantId: "t1", branchId: "b1",
      expectedRevision: 0, from: "received", to: "repairing" }],
    access: { actorId: "u1", tenantId: "t1", branchId: "b1",
      allowedTemplateIds: ["repair-job"], allowedTransitions: [] },
  }), /scope mismatch/);
  assert.equal(queries, 0);
  assert.equal(transactions, 0);
});

test("rejects forged event revisions and stages before opening SQLite transaction", async () => {
  let transactions = 0;
  const port = createIndustrySqliteCommitPort({
    prepare() { throw new Error("SQL must not execute"); },
    transaction() { transactions++; throw new Error("transaction must not start"); },
  });
  const original = { id: "job-1", tenantId: "t1", branchId: "b1",
    templateId: "repair-job", stage: "received", revision: 0, appliedEventIds: [] };
  const access = { actorId: "u1", tenantId: "t1", branchId: "b1",
    allowedTemplateIds: ["repair-job"], allowedTransitions: [] };
  const event = { eventId: "e1", tenantId: "t1", branchId: "b1",
    expectedRevision: 0, from: "received", to: "repairing" };
  for (const events of [[{ ...event, expectedRevision: 4 }], [{ ...event, from: "completed" }]]) {
    await assert.rejects(port.commit({
      original, next: { ...original, stage: "repairing", revision: 1, appliedEventIds: ["e1"] },
      events, access,
    }), /invalid event chain/);
  }
  await assert.rejects(port.commit({
    original, next: { ...original, stage: "completed", revision: 1, appliedEventIds: ["e1"] },
    events: [event], access,
  }), /final stage mismatch/);
  assert.equal(transactions, 0);
});
