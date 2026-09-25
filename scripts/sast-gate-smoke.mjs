import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/sast.yml", import.meta.url),
  "utf8",
);

assert.match(workflow, /^name:\s*SAST/m);
assert.match(workflow, /pull_request:[\s\S]*branches:\s*\[main\]/);
assert.match(workflow, /push:[\s\S]*branches:\s*\[main\]/);
assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);
assert.match(workflow, /semgrep==1\.162\.0/);
assert.match(workflow, /semgrep scan/);
assert.ok(workflow.includes("--config=p/default"));
assert.match(workflow, /--error/);
assert.match(workflow, /--metrics=off/);
assert.match(workflow, /--exclude=node_modules/);
assert.match(workflow, /--exclude=\.next/);
assert.match(workflow, /--exclude=dist/);
assert.match(workflow, /--exclude=release/);
assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
assert.doesNotMatch(workflow, /permissions:\s*write-all/);

console.log("SAST gate contract smoke PASS");
