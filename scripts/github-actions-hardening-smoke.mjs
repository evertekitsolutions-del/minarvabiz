import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const workflowsDir = new URL("../.github/workflows/", import.meta.url);
const workflowFiles = (await readdir(workflowsDir))
  .filter((name) => /\.ya?ml$/i.test(name))
  .sort();

assert.ok(workflowFiles.length > 0, "No GitHub Actions workflows found");

const immutableSha = /^[0-9a-f]{40}$/;

for (const name of workflowFiles) {
  const workflow = await readFile(new URL(name, workflowsDir), "utf8");
  const lines = workflow.split(/\r?\n/);

  const permissionsIndex = lines.findIndex((line) => /^permissions:\s*$/.test(line));
  assert.notEqual(
    permissionsIndex,
    -1,
    `${name}: top-level permissions block is required`,
  );

  const permissionEntries = [];
  for (let index = permissionsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (!/^\s/.test(line)) break;
    const match = line.match(/^ {2}([a-z-]+):\s*(\S+)\s*$/);
    if (match) permissionEntries.push([match[1], match[2]]);
  }

  assert.deepEqual(
    permissionEntries,
    [["contents", "read"]],
    `${name}: workflow token permissions must remain least-privilege contents: read`,
  );

  for (const [index, line] of lines.entries()) {
    const use = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/);
    if (!use) continue;

    const action = use[1];
    if (action.startsWith("./") || action.startsWith("docker://")) continue;

    const at = action.lastIndexOf("@");
    assert.ok(at > 0, `${name}:${index + 1}: external action is missing a ref`);

    const ref = action.slice(at + 1);
    assert.match(
      ref,
      immutableSha,
      `${name}:${index + 1}: external action must be pinned to a full 40-character commit SHA`,
    );
  }

  assert.doesNotMatch(
    workflow,
    /^permissions:\s*write-all\s*$/m,
    `${name}: write-all permissions are forbidden`,
  );
}

console.log(`GitHub Actions hardening smoke PASS (${workflowFiles.length} workflows)`);
