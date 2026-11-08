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
  }), /scope or authorization mismatch/);
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
    allowedTemplateIds: ["repair-job"], allowedTransitions: [
      { templateId: "repair-job", from: "received", to: "repairing" },
      { templateId: "repair-job", from: "completed", to: "repairing" },
    ] };
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

test("direct SQLite port denies missing template and transition grants before SQL", async () => {
  let transactions = 0;
  const port = createIndustrySqliteCommitPort({
    prepare() { throw new Error("unexpected SQL"); },
    transaction() { transactions++; throw new Error("unexpected transaction"); },
  });
  const original = { id: "job-1", tenantId: "t1", branchId: "b1",
    templateId: "repair-job", stage: "received", revision: 0, appliedEventIds: [] };
  const event = { eventId: "e1", tenantId: "t1", branchId: "b1",
    expectedRevision: 0, from: "received", to: "repairing" };
  const next = { ...original, stage: "repairing", revision: 1, appliedEventIds: ["e1"] };
  const access = { actorId: "u1", tenantId: "t1", branchId: "b1",
    allowedTemplateIds: ["repair-job"], allowedTransitions: [] };
  await assert.rejects(port.commit({ original, next, events: [event], access }),
    /transition not authorized/);
  await assert.rejects(port.commit({ original, next, events: [event],
    access: { ...access, allowedTemplateIds: [] } }), /authorization mismatch/);
  assert.equal(transactions, 0);
});

test("rejects unsafe, negative, and inconsistent SQLite revisions before SQL", async () => {
  let transactions = 0;
  const port = createIndustrySqliteCommitPort({
    prepare() { throw new Error("unexpected SQL"); },
    transaction() { transactions++; throw new Error("unexpected transaction"); },
  });
  const original = { id: "job-1", tenantId: "t1", branchId: "b1",
    templateId: "repair-job", stage: "received", revision: 0, appliedEventIds: [] };
  const event = { eventId: "e1", tenantId: "t1", branchId: "b1",
    expectedRevision: 0, from: "received", to: "repairing" };
  const access = { actorId: "u1", tenantId: "t1", branchId: "b1",
    allowedTemplateIds: ["repair-job"], allowedTransitions: [
      { templateId: "repair-job", from: "received", to: "repairing" },
    ] };
  for (const invalid of [
    { original: { ...original, revision: -1 } },
    { original: { ...original, revision: 0.5 } },
    { original: { ...original, revision: Number.MAX_SAFE_INTEGER } },
    { original: { ...original, appliedEventIds: ["fabricated"] } },
    { event: { ...event, expectedRevision: Number.NaN } },
  ]) {
    await assert.rejects(port.commit({
      original: invalid.original ?? original,
      next: { ...original, stage: "repairing", revision: 1, appliedEventIds: ["e1"] },
      events: [invalid.event ?? event], access,
    }), /invalid revision history/);
  }
  assert.equal(transactions, 0);
});

test("rejects corrupt persisted stage history inside transaction before inserting events", async () => {
  let inserts = 0;
  const original = { id: "job-1", tenantId: "t1", branchId: "b1",
    templateId: "repair-job", stage: "received", revision: 1, appliedEventIds: ["prior"] };
  const port = createIndustrySqliteCommitPort({
    transaction(callback) { return callback; },
    prepare(sql) {
      if (sql.startsWith("SELECT template_id")) return {
        get() { return { template_id: "repair-job", stage: "received", revision: 1 }; },
      };
      if (sql.startsWith("SELECT event_id")) return {
        get() { return { event_id: "prior", from_stage: "received", to_stage: "completed" }; },
      };
      return { run() { inserts++; return { changes: 1 }; } };
    },
  });
  await assert.rejects(port.commit({
    original,
    next: { ...original, stage: "repairing", revision: 2, appliedEventIds: ["prior", "next"] },
    events: [{ eventId: "next", tenantId: "t1", branchId: "b1",
      expectedRevision: 1, from: "received", to: "repairing" }],
    access: { actorId: "u1", tenantId: "t1", branchId: "b1",
      allowedTemplateIds: ["repair-job"],
      allowedTransitions: [{ templateId: "repair-job", from: "received", to: "repairing" }] },
  }), /event stage history mismatch/);
  assert.equal(inserts, 0);
});


test("rejects duplicate and malformed prior event IDs before opening SQLite transaction", async () => {
  let transactions = 0;
  const port = createIndustrySqliteCommitPort({
    prepare() { throw new Error("unexpected SQL"); },
    transaction() { transactions++; throw new Error("unexpected transaction"); },
  });
  const base = { id: "job-1", tenantId: "t1", branchId: "b1",
    templateId: "repair-job", stage: "received", revision: 2,
    appliedEventIds: ["prior-1", "prior-2"] };
  const event = { eventId: "next", tenantId: "t1", branchId: "b1",
    expectedRevision: 2, from: "received", to: "repairing" };
  const access = { actorId: "u1", tenantId: "t1", branchId: "b1",
    allowedTemplateIds: ["repair-job"],
    allowedTransitions: [{ templateId: "repair-job", from: "received", to: "repairing" }] };
  for (const appliedEventIds of [["prior-1", "prior-1"], ["prior-1", ""], ["prior-1", " ".repeat(3)]]) {
    const original = { ...base, appliedEventIds };
    await assert.rejects(port.commit({
      original, next: { ...original, stage: "repairing", revision: 3,
        appliedEventIds: [...appliedEventIds, "next"] },
      events: [event], access,
    }), /invalid revision history/);
  }
  assert.equal(transactions, 0);
});

test("refuses commits that would exceed the trusted read replay limit before SQL", async () => {
  let transactions = 0;
  const port = createIndustrySqliteCommitPort({
    prepare() { throw new Error("SQL must not execute"); },
    transaction() { transactions++; throw new Error("transaction must not start"); },
  });
  const original = {
    id: "job-1", tenantId: "t1", branchId: "b1",
    templateId: "repair-job", stage: "received", revision: 10000,
    appliedEventIds: Array.from({ length: 10000 }, (_, i) => "prior-" + i),
  };
  const event = {
    eventId: "next", tenantId: "t1", branchId: "b1",
    expectedRevision: 10000, from: "received", to: "repairing",
  };
  await assert.rejects(port.commit({
    original,
    next: { ...original, stage: "repairing", revision: 10001,
      appliedEventIds: [...original.appliedEventIds, "next"] },
    events: [event],
    access: { actorId: "u1", tenantId: "t1", branchId: "b1",
      allowedTemplateIds: ["repair-job"],
      allowedTransitions: [{ templateId: "repair-job", from: "received", to: "repairing" }] },
  }), /invalid revision history/);
  assert.equal(transactions, 0);
});
