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
const { readIndustrySqliteWorkflow, listIndustrySqliteWorkflows } = require("../industry-workflow-sqlite-read.ts");

const profile = { version: 1, primary: "repair", enabled: ["repair"] };
const access = { actorId: "staff-1", tenantId: "tenant-1", branchId: "branch-1",
  allowedTemplateIds: ["repair-job"], allowedTransitions: [] };
function database(row, event) {
  const calls = [];
  const db = {
    transaction(callback) { return () => callback(); },
    prepare(sql) {
      return { get(...args) {
        calls.push(args);
        return sql.includes("industry_workflow_events") ? event : row;
      } };
    },
  };
  return { db, calls };
}
test("reads an authorized scoped durable snapshot with reconstructed event ids", () => {
  const { db, calls } = database(
    { template_id: "repair-job", stage: "diagnosed", revision: 1 },
    { event_id: "event-1", actor_id: "staff-1", revision: 1, from_stage: "received", to_stage: "diagnosed" },
  );
  const result = readIndustrySqliteWorkflow(db, profile, access, "job-1");
  assert.deepEqual(result, { id: "job-1", tenantId: "tenant-1", branchId: "branch-1",
    templateId: "repair-job", stage: "diagnosed", revision: 1, appliedEventIds: ["event-1"] });
  assert.deepEqual(calls[0], ["tenant-1", "branch-1", "job-1"]);
  assert.deepEqual(calls[1], ["tenant-1", "branch-1", "job-1", 1]);
});
test("returns null for absent scoped record", () => {
  assert.equal(readIndustrySqliteWorkflow(database(undefined).db, profile, access, "missing"), null);
});
test("rejects unauthorized templates before any SQLite query", () => {
  const { db, calls } = database({ template_id: "repair-job", stage: "received", revision: 0 });
  assert.throws(() => readIndustrySqliteWorkflow(db, profile,
    { ...access, allowedTemplateIds: [] }, "job-1"), /denied/);
  assert.equal(calls.length, 0);
});
test("single-record read with empty grants denies before any SQLite access", () => {
  let transactions = 0;
  let queries = 0;
  const db = {
    transaction(fn) { transactions++; return fn; },
    prepare() { queries++; throw Error("unauthorized SQL"); },
  };
  assert.throws(() => readIndustrySqliteWorkflow(db, profile,
    { ...access, allowedTemplateIds: [] }, "job-1"), /read denied/);
  assert.equal(transactions, 0);
  assert.equal(queries, 0);
});
test("rejects missing history, fabricated stage and invalid actor", () => {
  const row = { template_id: "repair-job", stage: "diagnosed", revision: 1 };
  assert.throws(() => readIndustrySqliteWorkflow(database(row, undefined).db, profile, access, "job-1"), /corrupt/);
  assert.throws(() => readIndustrySqliteWorkflow(database({ ...row, stage: "handed-over" }, {
    event_id: "event-1", actor_id: "staff-1", revision: 1, from_stage: "received", to_stage: "diagnosed",
  }).db, profile, access, "job-1"), /snapshot mismatch/);
  assert.throws(() => readIndustrySqliteWorkflow(database(row, {
    event_id: "event-1", actor_id: "", revision: 1, from_stage: "received", to_stage: "diagnosed",
  }).db, profile, access, "job-1"), /corrupt/);
});
test("rejects malformed persisted event stages before replay", () => {
  const row = { template_id: "repair-job", stage: "diagnosed", revision: 1 };
  const event = { event_id: "event-1", actor_id: "staff-1", revision: 1,
    from_stage: "received", to_stage: "diagnosed" };
  for (const field of ["from_stage", "to_stage"]) {
    for (const value of ["", " ".repeat(3), "x".repeat(129), null]) {
      const { db } = database(row, { ...event, [field]: value });
      assert.throws(() => readIndustrySqliteWorkflow(db, profile, access, "job-1"),
        /corrupt event history/);
    }
  }
});

test("rejects untrusted read scope before SQL", () => {
  let queries = 0;
  const db = { prepare() { queries++; throw Error("SQL executed"); }, transaction(fn) { return fn; } };
  assert.throws(() => readIndustrySqliteWorkflow(db, profile, { ...access, actorId: "" }, "job-1"), /authorization/);
  assert.equal(queries, 0);
});

test("scoped inbox paginates and replays each authorized workflow", () => {
  const queries = [];
  const db = {
    transaction(callback) { return () => callback(); },
    prepare(sql) {
      return {
        all(...args) {
          queries.push({ sql, args });
          return [{ record_id: "job-1" }, { record_id: "job-2" }];
        },
        get(...args) {
          queries.push({ sql, args });
          return sql.includes("industry_workflow_events")
            ? { event_id: "evt-" + args[2], actor_id: "staff-1", revision: 1, from_stage: "received", to_stage: "diagnosed" }
            : { template_id: "repair-job", stage: "diagnosed", revision: 1 };
        },
      };
    },
  };
  const result = listIndustrySqliteWorkflows(db, profile, access, { limit: 1 });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].id, "job-1");
  assert.equal(result.nextCursor, "job-1");
  assert.deepEqual(queries[0].args, ["tenant-1", "branch-1", "repair-job", "", 2]);
  assert.match(queries[0].sql, /template_id IN/);
  assert.ok(queries[0].sql.includes("tenant_id=? AND branch_id=?"));
});
test("scoped inbox rejects invalid scope and pagination before SQL", () => {
  let queries = 0;
  const db = {
    transaction(fn) { return fn; },
    prepare() { queries++; throw Error("unexpected SQL"); },
  };
  assert.throws(() => listIndustrySqliteWorkflows(db, profile, { ...access, actorId: "" }), /authorization/);
  assert.throws(() => listIndustrySqliteWorkflows(db, profile, access, { limit: 51 }), /pagination/);
  assert.throws(() => listIndustrySqliteWorkflows(db, profile, access, { afterId: "" }), /pagination/);
  assert.equal(queries, 0);
});

test("inbox with no template grants returns no rows without querying storage", () => {
  let queries = 0;
  const db = { transaction(fn) { return fn; }, prepare() { queries++; throw Error("SQL should not run"); } };
  assert.deepEqual(listIndustrySqliteWorkflows(db, profile, { ...access, allowedTemplateIds: [] }),
    { records: [], nextCursor: null });
  assert.equal(queries, 0);
});
test("inbox binds deduplicated template grants as SQL parameters, not SQL text", () => {
  let query, args;
  const db = { transaction(fn) { return fn; }, prepare(sql) { query = sql; return { all(...params) { args = params; return []; } }; } };
  const grants = ["repair-job", "salon-visit", "repair-job"];
  assert.deepEqual(listIndustrySqliteWorkflows(db, profile,
    { ...access, allowedTemplateIds: grants }), { records: [], nextCursor: null });
  assert.match(query, /template_id IN \(\?,\?\)/);
  assert.deepEqual(args, ["tenant-1", "branch-1", "repair-job", "salon-visit", "", 26]);
});

test("inbox rejects oversized grant sets before issuing SQL", () => {
  let queries = 0;
  const db = { transaction(fn) { return fn; }, prepare() { queries++; throw Error("unexpected SQL"); } };
  const grants = Array.from({ length: 101 }, (_, index) => `industry-${index}`);
  assert.throws(() => listIndustrySqliteWorkflows(db, profile,
    { ...access, allowedTemplateIds: grants }), /Too many industry workflow template grants/);
  assert.equal(queries, 0);
});

test("inbox rejects duplicate, unordered, out-of-cursor and oversized database pages", () => {
  const makeDb = (rows) => {
    let recordReads = 0;
    return {
      db: {
        transaction(fn) { return fn; },
        prepare(sql) {
          if (sql.includes("SELECT record_id")) return { all() { return rows; } };
          recordReads++;
          throw Error("must not read corrupt page records");
        },
      },
      get recordReads() { return recordReads; },
    };
  };
  for (const rows of [
    [{ record_id: "job-2" }, { record_id: "job-2" }],
    [{ record_id: "job-3" }, { record_id: "job-2" }],
    [{ record_id: "job-1" }],
    [{ record_id: "job-2" }, { record_id: "job-3" }, { record_id: "job-4" }],
  ]) {
    const fixture = makeDb(rows);
    assert.throws(() => listIndustrySqliteWorkflows(fixture.db, profile, access,
      { afterId: "job-1", limit: 1 }), /corrupt records/);
    assert.equal(fixture.recordReads, 0);
  }
});

test("single-record reads fail closed on malformed or excessive template grants before SQL", () => {
  let queries = 0;
  const db = { prepare() { queries++; throw Error("unexpected SQL"); }, transaction(fn) { return fn; } };
  for (const allowedTemplateIds of [["repair-job", ""], ["repair-job", 42],
    Array.from({ length: 101 }, (_, i) => `template-${i}`)]) {
    assert.throws(() => readIndustrySqliteWorkflow(db, profile,
      { ...access, allowedTemplateIds }, "job-1"), /authorization/);
  }
  assert.equal(queries, 0);
});
