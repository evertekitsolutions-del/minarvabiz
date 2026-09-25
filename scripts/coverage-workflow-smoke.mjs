import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workflow, policyRaw, reporter, ratchet] = await Promise.all([
  readFile(new URL("../.github/workflows/coverage.yml", import.meta.url), "utf8"),
  readFile(new URL("../security/coverage-policy.json", import.meta.url), "utf8"),
  readFile(new URL("./coverage-json-reporter.mjs", import.meta.url), "utf8"),
  readFile(new URL("./coverage-ratchet.mjs", import.meta.url), "utf8"),
]);

const policy = JSON.parse(policyRaw);

assert.match(workflow, /^name:\s*Coverage Ratchet/m);
assert.match(workflow, /pull_request:[\s\S]*branches:\s*\[main\]/);
assert.match(workflow, /push:[\s\S]*branches:\s*\[main\]/);
assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);
assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/i);
assert.match(workflow, /fetch-depth:\s*0/);
assert.match(workflow, /--experimental-test-coverage/);
assert.match(workflow, /coverage-json-reporter\.mjs/);
assert.match(workflow, /coverage\/lcov\.info/);
assert.match(workflow, /coverage-ratchet\.mjs/);
assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/i);
assert.doesNotMatch(workflow, /^\s+[a-z-]+:\s+write\s*$/m);

assert.equal(policy.schemaVersion, 1);
assert.equal(policy.baseBranch, "main");
assert.equal(typeof policy.overallLineMinimum, "number");
assert.equal(policy.changedLineMinimum, 80);
assert.ok(policy.targetPrefixes.includes("packages/business-logic/src/"));
assert.ok(policy.targetPrefixes.includes("packages/database/src/"));

assert.match(reporter, /test:coverage/);
assert.match(reporter, /event\.data\.summary/);
assert.match(ratchet, /coveredLinePercent/);
assert.match(ratchet, /git/);
assert.match(ratchet, /changedLineMinimum/);
assert.match(ratchet, /file not exercised by coverage suite/);
assert.ok(
  ratchet.indexOf('const sourceLine = source[lineNumber - 1]') <
    ratchet.indexOf('if (coverage?.has(lineNumber))'),
  "ratchet must discard blank/comment-only diff lines before consulting coverage entries",
);

console.log("Coverage reporting + changed-code ratchet contract PASS");
