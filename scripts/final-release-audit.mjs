import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));

const requiredWorkflows = [
  "ci.yml",
  "coverage.yml",
  "dependency-security.yml",
  "final-release-audit.yml",
  "licensing-smoke.yml",
  "release-windows.yml",
  "sast.yml",
  "sbom-license.yml",
  "secret-scan.yml",
  "staging-quality.yml",
  "windows-deep-smoke.yml",
  "windows-feature-smoke.yml",
];

for (const workflow of requiredWorkflows) {
  const relative = path.join(".github", "workflows", workflow);
  assert.ok(exists(relative), `Missing required workflow: ${workflow}`);
  const source = read(relative);
  assert.match(source, /^permissions:\s*\n\s+contents:\s+read/m, `${workflow}: contents must be read-only`);
  assert.doesNotMatch(source, /permissions:\s*write-all/);
  assert.doesNotMatch(source, /contents:\s*write/);

  for (const match of source.matchAll(/uses:\s*([^\s#]+)@([^\s#]+)/g)) {
    const action = match[1];
    const ref = match[2];
    if (action.startsWith("./")) continue;
    assert.match(ref, /^[0-9a-f]{40}$/i, `${workflow}: ${action} must use an immutable 40-char SHA`);
  }
}

const requiredDocs = [
  "LICENSE",
  "docs/COMPLIANCE.md",
  "docs/CUSTOMER_DELIVERY_RUNBOOK.md",
  "docs/FINAL_RELEASE_AUDIT.md",
  "docs/GOVERNANCE.md",
  "docs/RELEASE.md",
];
for (const relative of requiredDocs) assert.ok(exists(relative), `Missing release/governance document: ${relative}`);

const requiredPolicies = [
  "security/coverage-policy.json",
  "security/dependency-license-policy.json",
  "security/hotspot-policy.json",
  "security/staging-quality-policy.json",
];
for (const relative of requiredPolicies) assert.ok(exists(relative), `Missing release policy: ${relative}`);

const rootPackage = JSON.parse(read("package.json"));
const desktopPackage = JSON.parse(read("apps/desktop/package.json"));
assert.equal(rootPackage.packageManager, "pnpm@9.15.0");
assert.equal(rootPackage.version, desktopPackage.version, "Root and Windows desktop release versions must match");

const dataSource = read("apps/web/src/lib/data-source.ts");
const mapperModule = read("apps/web/src/lib/data-source-mappers.ts");
assert.ok(dataSource.split(/\r?\n/).length <= 900, "Web data-source hotspot regressed above 900 lines");
assert.doesNotMatch(dataSource, /function\s+mapCategory\s*\(/);
assert.match(mapperModule, /export function mapCategory\s*\(/);
assert.match(mapperModule, /export function mapJournalEntry\s*\(/);

const governance = read("docs/GOVERNANCE.md");
assert.match(governance, /new migration/i);
assert.match(governance, /security exception/i);
assert.match(governance, /rollback/i);
assert.match(governance, /release tag/i);

const release = read("docs/RELEASE.md");
assert.match(release, /Step 25/i);
assert.match(release, /controlled release/i);

console.log("FINAL_RELEASE_AUDIT PASS", JSON.stringify({
  workflows: requiredWorkflows.length,
  requiredDocs: requiredDocs.length,
  requiredPolicies: requiredPolicies.length,
  productVersion: rootPackage.version,
  webDataSourceLines: dataSource.split(/\r?\n/).length,
}));
