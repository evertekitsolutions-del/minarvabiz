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
assert.deepEqual(
  [...policy.allowedLicenses].sort(),
  ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MIT-0", "0BSD", "PostgreSQL", "CC0-1.0"].sort(),
);
assert.deepEqual(policy.allowedExceptions, []);
const denied = policy.deniedLicensePatterns.map((pattern) => new RegExp(pattern, "i"));
for (const value of ["GPL-3.0-or-later", "AGPL-3.0", "SSPL-1.0", "BUSL-1.1", "Elastic-2.0", "other", "OTHER"]) {
  assert.ok(denied.some((pattern) => pattern.test(value)), "Not denied: " + value);
}
assert.ok(!denied.some((pattern) => pattern.test("LGPL-3.0-or-later")));
assert.ok(policy.reviewRequiredLicensePatterns.some((pattern) => new RegExp(pattern, "i").test("LGPL-3.0-or-later")));
assert.equal(typeof policy.reviewedPackages, "object");
for (const [pkg, review] of Object.entries(policy.reviewedPackages)) {
  assert.match(pkg, /@[^@]+$/);
  assert.equal(review.approved, true);
  assert.match(review.license, /^LGPL-/);
  assert.ok(review.rationale && review.rationale.length > 20);
}

console.log("SBOM + dependency-license workflow contract PASS");
