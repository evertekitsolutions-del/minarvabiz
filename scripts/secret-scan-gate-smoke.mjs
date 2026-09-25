import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/secret-scan.yml", import.meta.url),
  "utf8",
);

assert.match(workflow, /^name:\s*Secret Scan/m);
assert.match(workflow, /push:[\s\S]*branches:\s*\[main\]/);
assert.match(workflow, /pull_request:[\s\S]*branches:\s*\[main\]/);
assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);

assert.match(workflow, /actions\/checkout@v7[\s\S]*fetch-depth:\s*0/);
assert.match(workflow, /github\\.com\\/zricethezav\\/gitleaks\\/v8@v8\\.30\\.1/);
assert.ok(workflow.includes('"$GITLEAKS" git --redact --verbose --log-opts="--all" .'));
assert.ok(workflow.includes('"$GITLEAKS" dir --redact --verbose .'));
assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
assert.doesNotMatch(workflow, /--no-git/);
assert.doesNotMatch(workflow, /permissions:\s*write-all/);

console.log("Secret scan gate contract smoke PASS");
