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
const { readIndustrySqliteWorkflow } = require("../industry-workflow-sqlite-read.ts");

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
test("rejects unauthorized templates without querying event history", () => {
  const { db, calls } = database({ template_id: "repair-job", stage: "received", revision: 0 });
  assert.throws(() => readIndustrySqliteWorkflow(db, profile,
    { ...access, allowedTemplateIds: [] }, "job-1"), /denied/);
  assert.equal(calls.length, 1);
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
test("rejects untrusted read scope before SQL", () => {
  let queries = 0;
  const db = { prepare() { queries++; throw Error("SQL executed"); }, transaction(fn) { return fn; } };
  assert.throws(() => readIndustrySqliteWorkflow(db, profile, { ...access, actorId: "" }, "job-1"), /authorization/);
  assert.equal(queries, 0);
});
