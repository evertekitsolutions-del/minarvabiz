import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/sbom-license.yml", import.meta.url),
  "utf8",
);
const policy = JSON.parse(
  await readFile(new URL("../security/dependency-license-policy.json", import.meta.url), "utf8"),
);

assert.match(workflow, /^name:\s*SBOM \+ Dependency License Policy/m);
assert.match(workflow, /push:[\s\S]*branches:\s*\[main\]/);
assert.match(workflow, /pull_request:[\s\S]*branches:\s*\[main\]/);
assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);
assert.match(workflow, /anchore\/sbom-action@[0-9a-f]{40}/i);
assert.match(workflow, /format:\s*cyclonedx-json/);
assert.match(workflow, /syft-version:\s*["']?v1\.52\.0["']?/);
assert.match(workflow, /dependency-snapshot:\s*false/);
assert.match(workflow, /upload-artifact:\s*false/);
assert.match(workflow, /upload-release-assets:\s*false/);
assert.match(workflow, /dependency-license-policy\.mjs/);
assert.match(workflow, /sbom-validate\.mjs/);
assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/i);
assert.doesNotMatch(workflow, /permissions:\s*write-all/);
assert.doesNotMatch(workflow, /^\s+[a-z-]+:\s+write\s*$/m);

assert.equal(policy.schemaVersion, 1);
assert.ok(policy.allowedLicenses.includes("MIT"));
assert.ok(policy.allowedLicenses.includes("Apache-2.0"));
assert.ok(policy.deniedLicensePatterns.some((value) => value.includes("AGPL")));
assert.ok(policy.deniedLicensePatterns.some((value) => value.includes("SSPL")));
assert.equal(typeof policy.reviewedPackages, "object");

console.log("SBOM + dependency-license workflow contract PASS");
