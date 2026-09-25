import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/dependency-security.yml", import.meta.url),
  "utf8",
);
const rootPackage = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

assert.match(workflow, /^name:\s*Dependency Security/m);
assert.match(workflow, /push:[\s\S]*branches:\s*\[main\]/);
assert.match(workflow, /pull_request:[\s\S]*branches:\s*\[main\]/);
assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);
assert.match(workflow, /pnpm audit --prod --audit-level high/);
assert.match(workflow, /version:\s*9\.15\.0/);
assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
assert.doesNotMatch(workflow, /permissions:\s*write-all/);

assert.equal(rootPackage.pnpm?.overrides?.postcss, "^8.5.18");

const lockfile = await readFile(new URL("../pnpm-lock.yaml", import.meta.url), "utf8");
assert.match(lockfile, /overrides:\s*\n\s+postcss:\s+\^8\.5\.18/);
assert.doesNotMatch(lockfile, /postcss@8\.4\.31/);
assert.doesNotMatch(lockfile, /postcss:\s+8\.4\.31/);

console.log("Dependency security gate contract smoke PASS");
