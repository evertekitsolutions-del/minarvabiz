import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [pkgRaw, license, notices, compliance, readme, licensingDoc, policyRaw] =
  await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../LICENSE", import.meta.url), "utf8"),
    readFile(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/COMPLIANCE.md", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/LICENSING.md", import.meta.url), "utf8"),
    readFile(
      new URL("../security/dependency-license-policy.json", import.meta.url),
      "utf8",
    ),
  ]);

const pkg = JSON.parse(pkgRaw);
const policy = JSON.parse(policyRaw);

assert.equal(pkg.private, true, "root package must remain private");
assert.equal(
  pkg.license,
  "UNLICENSED",
  "root package must remain explicitly UNLICENSED",
);

assert.match(license, /PROPRIETARY SOFTWARE NOTICE/);
assert.match(license, /Evertek IT Solutions/);
assert.match(license, /Public visibility .* does not grant an open-source license/is);
assert.match(license, /Third-party software is not relicensed/i);
assert.match(license, /THIRD_PARTY_NOTICES\.md/);

assert.match(notices, /CycloneDX SBOM/);
assert.match(notices, /dependency-licenses\.json/);
assert.match(notices, /LGPL-3\.0-or-later/);
assert.match(notices, /license gate is denied, unknown, or awaiting/i);

assert.match(compliance, /proprietary commercial product/i);
assert.match(compliance, /Product entitlement \/ activation/);
assert.match(compliance, /Repository\/source rights/);
assert.match(compliance, /Release compliance checklist/);
assert.match(compliance, /dependency-license policy passes/i);

assert.match(readme, /\[Proprietary software notice\]\(LICENSE\)/);
assert.match(readme, /\[Third-party notices\]\(THIRD_PARTY_NOTICES\.md\)/);
assert.match(readme, /\[Repository compliance\]\(docs\/COMPLIANCE\.md\)/);
assert.match(licensingDoc, /Product entitlement vs repository rights/);
assert.match(licensingDoc, /does not grant source-code rights/i);

assert.equal(policy.schemaVersion, 1);
assert.ok(
  Object.values(policy.reviewedPackages ?? {}).some(
    (entry) => entry?.license === "LGPL-3.0-or-later" && entry?.approved === true,
  ),
  "review-required LGPL dependency must remain explicitly documented",
);

console.log("Repository licensing/compliance declaration PASS");
