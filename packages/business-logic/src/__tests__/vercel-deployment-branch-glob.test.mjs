import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
for (const filename of ["vercel.json", "apps/web/vercel.json"]) {
  const config = JSON.parse(fs.readFileSync(path.join(root, filename), "utf8"));
  assert.equal(
    config?.git?.deploymentEnabled,
    false,
    `${filename}: Vercel Git builds must be disabled for ALL branches, including main and staging`,
  );
  assert.equal(config.github?.enabled, false, `${filename}: legacy Vercel Git integration must stay disabled`);
}
console.log("Vercel automated deployments disabled in all repository entry points PASS");
