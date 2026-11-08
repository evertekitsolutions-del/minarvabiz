import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(new URL("../.github/workflows/windows-release-upgrade-e2e.yml", import.meta.url), "utf8");
const runner = fs.readFileSync(new URL("./windows-release-update-e2e.mjs", import.meta.url), "utf8");

const requiredWorkflow = [
  "on:\n  workflow_dispatch:",
  "from_version:",
  "to_version:",
  "inputs.from_version",
  "inputs.to_version",
  "minarva-biz-license-edge.minarva-biz.workers.dev/api/update/manifest",
  "Require published, newer, signed stable target",
  "STABLE_UPGRADE_PREFLIGHT PASS",
  "Get-FileHash -Algorithm SHA256",
  "Verify target version and preserved business data",
];
for (const term of requiredWorkflow) {
  assert.ok(workflow.includes(term), "Windows E2E missing: " + term);
}
for (const forbidden of ["pull_request:", "onrender.com", "1.0.13", "1.0.14"]) {
  assert.ok(!workflow.includes(forbidden), "Obsolete or unsafe Windows E2E workflow term: " + forbidden);
}
for (const term of [
  "Explicit source/target stable versions are required",
  "MINARVA_UPDATE_FROM",
  "MINARVA_UPDATE_TO",
  "TRIAL_PRESERVED PASS",
  "BUSINESS_DATA_PRESERVED PASS",
  "UPDATE_SAFETY_BACKUP PASS",
]) {
  assert.ok(runner.includes(term), "Windows E2E runner missing: " + term);
}
for (const forbidden of ["1.0.13", "1.0.14", "dashboard opens"]) {
  assert.ok(!runner.includes(forbidden), "Obsolete Windows E2E runner term: " + forbidden);
}
console.log("Windows upgrade E2E isolated-manual, versioned, Cloudflare-only safety contract PASS");
