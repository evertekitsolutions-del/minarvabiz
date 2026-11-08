import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(new URL("../.github/workflows/windows-release-upgrade-e2e.yml", import.meta.url), "utf8");
const runner = fs.readFileSync(new URL("./windows-release-update-e2e.mjs", import.meta.url), "utf8");

assert.match(workflow, /^on:\\n  workflow_dispatch:/m, "Upgrade E2E must be owner-initiated only");
assert.doesNotMatch(workflow, /^\\s+pull_request:/m, "Never run the historical upgrade on PR");
assert.match(workflow, /from_version:/);
assert.match(workflow, /to_version:/);
assert.match(workflow, /inputs\\.from_version/);
assert.match(workflow, /inputs\\.to_version/);
assert.match(workflow, /minarva-biz-license-edge\\.minarva-biz\\.workers\\.dev\\/api\\/update\\/manifest/);
assert.match(workflow, /Require published, newer, signed stable target/);
assert.match(workflow, /STABLE_UPGRADE_PREFLIGHT PASS/);
assert.match(workflow, /Get-FileHash -Algorithm SHA256/);
assert.match(workflow, /Verify target version and preserved business data/);
assert.doesNotMatch(workflow, /onrender\\.com|render\\.com|1\\.0\\.13|1\\.0\\.14/);
assert.match(runner, /Explicit source\\/target stable versions are required/);
assert.match(runner, /MINARVA_UPDATE_FROM/);
assert.match(runner, /MINARVA_UPDATE_TO/);
assert.match(runner, /TRIAL_PRESERVED PASS/);
assert.match(runner, /BUSINESS_DATA_PRESERVED PASS/);
assert.match(runner, /UPDATE_SAFETY_BACKUP PASS/);
assert.doesNotMatch(runner, /1\\.0\\.13|1\\.0\\.14|dashboard opens/);
console.log("Windows upgrade E2E isolated-manual, versioned, Cloudflare-only safety contract PASS");
