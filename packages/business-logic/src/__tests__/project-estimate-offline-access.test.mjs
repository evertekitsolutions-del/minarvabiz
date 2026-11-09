import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, file);
const { createOfflineProjectEstimateStore } = require("../../../../apps/web/src/lib/project-estimate-offline-store.ts");

test("offline estimate reader denies missing view grant before opening storage", async () => {
  const store = createOfflineProjectEstimateStore("minarvabiz-project-estimates:principal_123");
  const scope = { tenantId: "tenant", companyId: "company", branchId: "branch", projectId: "project" };
  await assert.rejects(store.loadScoped({ ...scope, canViewCosts: false }), /permission denied/);
  await assert.rejects(store.loadScoped(scope), /permission denied/);
});

test("offline estimate reader does not silently grant access without IndexedDB", async () => {
  const store = createOfflineProjectEstimateStore("minarvabiz-project-estimates:principal_123");
  await assert.rejects(store.loadScoped({
    tenantId: "tenant", companyId: "company", branchId: "branch", projectId: "project", canViewCosts: true,
  }), /Offline storage unavailable/);
});

test("offline writer rejects forged totals before opening IndexedDB", async () => {
  const store = createOfflineProjectEstimateStore("minarvabiz-project-estimates:principal_123");
  const scope = { tenantId: "tenant", companyId: "company", branchId: "branch", projectId: "project" };
  const worksheet = {
    ...scope, currency: "USD", revision: 0,
    lines: [{ id: "line-1", description: "Site survey", kind: "labor",
      quantity: "2", unitCost: "100.00", markupPercent: "10" }],
  };
  await assert.rejects(store.saveAtomically({
    scope, expectedRevision: 0, nextRevision: 1, idempotencyKey: "retry-1",
    worksheet, totals: { projectId: "project", revision: 0, currency: "USD",
      costMinor: 1, proposedRevenueMinor: 1, grossMarginMinor: 0, lines: [] },
    audit: { actorId: "staff-1", action: "project.estimate.saved", revision: 1 },
  }), /totals mismatch/);
});
