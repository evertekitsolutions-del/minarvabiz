import { test } from "node:test";
import assert from "node:assert/strict";
import { assessRuns, assertSafePreviewConfig, requiredWorkflowNames } from "./cloudflare-customer-preview-gate.mjs";

const sha = "a".repeat(40);
const success = (name, id = 1) => ({
  name, id, head_sha: sha, event: "push", status: "completed", conclusion: "success",
});
const ready = () => requiredWorkflowNames.map((name, i) => success(name, i + 1));

test("exact-main run set passes with all mandatory workflows successful", () => {
  assert.deepEqual(assessRuns(ready(), sha), []);
});

test("missing and pending mandatory run fail closed", () => {
  const runs = ready().filter((x) => x.name !== "SAST");
  runs.find((x) => x.name === "CI").status = "in_progress";
  assert.match(assessRuns(runs, sha).join(" / "), /SAST.*no run/);
  assert.match(assessRuns(runs, sha).join(" / "), /CI.*in_progress/);
});

test("a newer failed rerun overrides an old successful run", () => {
  const runs = ready();
  runs.push({ ...success("CI", 999), conclusion: "failure" });
  assert.match(assessRuns(runs, sha).join(" / "), /CI.*failure/);
});

test("checks for another SHA or pull request never authorize a deploy", () => {
  const runs = ready();
  runs.push({ ...success("CI", 999), head_sha: "b".repeat(40) });
  assert.deepEqual(assessRuns(runs, sha), []);
  runs.push({ ...success("CI", 1000), event: "pull_request" });
  assert.match(assessRuns(runs, sha).join(" / "), /expected a main push run/);
});

test("worker name, route and paid storage cannot drift", () => {
  const safe = {
    name: "minarvabiz-customer-web-preview",
    workers_dev: true,
  };
  assert.doesNotThrow(() => assertSafePreviewConfig(safe));
  for (const bad of [
    { name: "minarva-biz-license-edge" },
    { routes: ["example.com/*"] },
    { route: "example.com/*" },
    { workers_dev: false },
    { r2_buckets: [{ binding: "FILES", bucket_name: "new-paid-store" }] },
    { d1_databases: [{ binding: "DB", database_id: "unsafe" }] },
    { vars: { SECRET: "never" } },
  ]) {
    assert.throws(() => assertSafePreviewConfig({ ...safe, ...bad }));
  }
});
