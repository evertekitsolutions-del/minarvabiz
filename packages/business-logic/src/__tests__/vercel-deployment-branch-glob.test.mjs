import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");

for (const relativePath of ["vercel.json", "apps/web/vercel.json"]) {
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
  const rules = config?.git?.deploymentEnabled;

  assert.equal(rules?.["**"], false, `${relativePath} must disable all non-whitelisted branches, including names with slashes`);
  assert.equal(rules?.main, true, `${relativePath} must keep main deployments enabled`);
  assert.equal(rules?.staging, true, `${relativePath} must keep staging deployments enabled`);
  assert.equal(Object.hasOwn(rules ?? {}, "*"), false, `${relativePath} must not use single-star fallback because it does not match slash-delimited branch names`);
}

console.log("Vercel deployment branch glob contract PASS");
