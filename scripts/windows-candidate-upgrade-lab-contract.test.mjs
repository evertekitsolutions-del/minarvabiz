import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(new URL("../.github/workflows/windows-candidate-upgrade-lab.yml",import.meta.url),"utf8");
const fixture = fs.readFileSync(new URL("./windows-candidate-upgrade-fixture.mjs",import.meta.url),"utf8");
const cdp = fs.readFileSync(new URL("./windows-candidate-upgrade-cdp.mjs",import.meta.url),"utf8");

test("candidate NSIS lab runs only in Windows CI and cannot publish customer releases", () => {
  for(const item of ["runs-on: windows-latest","workflow_dispatch:","pull_request:",
    'SOURCE_VERSION: "1.0.26"','LAB_CANDIDATE_VERSION: "1.0.27"',
    "UNPUBLISHED ephemeral", "PUBLISHED_SOURCE_SHA256 PASS",
    "UNPUBLISHED_NSIS_IN_PLACE_UPGRADE PASS","P0_CANDIDATE_NSIS_LEDGER_PRESERVATION PASS"]) {
    assert.ok(workflow.includes(item),"Missing release safety gate: "+item);
  }
  for(const forbidden of ["vercel.app","onrender.com","mcp__Vercel","mcp__Render",
    "gh release create","gh release upload","actions/upload-artifact","gh workflow run"]) {
    assert.ok(!workflow.toLowerCase().includes(forbidden.toLowerCase()),"Forbidden production action/dependency: "+forbidden);
  }
  assert.match(workflow,/MINARVA_ISOLATED_UPGRADE_LAB: "1"/);
  assert.match(workflow,/workflow_dispatch:\s*\n/);
  assert.ok(!workflow.includes("contents: write"),"No write permission to releases");
});

test("runner must build an unpublished changed-version candidate and verify old published installer checksum", () => {
  assert.ok(workflow.indexOf("Verify this workflow never publishes") < workflow.indexOf("Build an UNPUBLISHED"));
  assert.ok(workflow.indexOf("independently verify published v1.0.26") < workflow.indexOf("Install published source"));
  assert.ok(workflow.indexOf("PUBLISHED_SOURCE_SHA256 PASS") < workflow.indexOf("Install published source"));
  assert.ok(workflow.indexOf("Source image") === -1);
  assert.ok(workflow.includes("Set-Content -LiteralPath $package -Encoding utf8"),"Version must be patched only on runner");
  assert.ok(workflow.includes("ISOLATED_PREUPGRADE_BACKUP_PASS"));
  assert.ok(workflow.includes("LAB_PREUPGRADE_BACKUP_SHA256"));
  assert.ok(workflow.indexOf("Verify candidate desktop, trial") > workflow.indexOf("Install unpublished test candidate IN PLACE"));
});

test("synthetic fixture is >=40 products with variants and finance + laundry; guard fails closed outside GitHub runner", () => {
  for(const term of ["GITHUB_ACTIONS", "MINARVA_ISOLATED_UPGRADE_LAB", "RUNNER_TEMP",
    "assert.equal(Array.isArray(snap[key])", "length:8", "length:42",
    "parentProductId", "sellingPrice", "stockQuantity", "payments", "outbox",
    "orders", "laundry", "balanceAmount", "PRAGMA quick_check", "domain_snapshot_v2",
    "Normalized table must agree", "Entity counts changed during upgrade", "Core product/stock/price/ledger fingerprints changed"]) {
    assert.ok(fixture.includes(term),"Missing immutable fixture requirement: "+term);
  }
  assert.ok(fixture.includes('String(i).padStart(2,"0")'));
  assert.ok(!fixture.includes("customer@example.com"));
  assert.ok(!fixture.includes("releases/download/v1.0.27"));
});

test("CDP checks installed native version + intact trial after upgrade", () => {
  for(const term of ["EXPECTED_APP_VERSION","activateTrial","getVersion","getTrialState",
    'assert.equal(state.status, "active"','assert.equal(version, expected',
    "ISOLATED_SOURCE_TRIAL_ACTIVATED", "ISOLATED_UPGRADE_TRIAL_AND_RENDERER_PASS"]) {
    assert.ok(cdp.includes(term),"Missing actual packaged Electron verification: "+term);
  }
});
