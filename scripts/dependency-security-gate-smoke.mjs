import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/dependency-security.yml", import.meta.url),
  "utf8",
);

assert.match(workflow, /^name:\s*Dependency Security/m);
assert.match(workflow, /push:[\s\S]*branches:\s*\[main\]/);
assert.match(workflow, /pull_request:[\s\S]*branches:\s*\[main\]/);
assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);

assert.match(workflow, /actions\/dependency-review-action@v5/);
assert.match(workflow, /fail-on-severity:\s*high/);
assert.match(workflow, /fail-on-scopes:\s*runtime/);
assert.match(workflow, /license-check:\s*false/);
assert.match(workflow, /github\.event_name == 'pull_request'/);

assert.match(workflow, /pnpm audit --prod --audit-level high/);
assert.match(workflow, /version:\s*9\.15\.0/);
assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
assert.doesNotMatch(workflow, /permissions:\s*write-all/);

console.log("Dependency security gate contract smoke PASS");
