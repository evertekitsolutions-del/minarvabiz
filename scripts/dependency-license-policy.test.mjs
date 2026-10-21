import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./dependency-license-policy.mjs", import.meta.url));
const policy = JSON.parse(
  readFileSync(new URL("../security/dependency-license-policy.json", import.meta.url), "utf8"),
);

function invoke(packages, mutatePolicy = (value) => value) {
  const root = mkdtempSync(path.join(os.tmpdir(), "minarva-license-fixture-"));
  try {
    const policyPath = path.join(root, "security", "dependency-license-policy.json");
    mkdirSync(path.dirname(policyPath), { recursive: true });
    writeFileSync(policyPath, JSON.stringify(mutatePolicy(structuredClone(policy))));
    mkdirSync(path.join(root, "node_modules", ".pnpm"), { recursive: true });
    for (let i = 0; i < packages.length; i += 1) {
      const item = packages[i];
      const packagePath = path.join(
        root, "node_modules", ".pnpm", `fixture-${i}`, "node_modules", `fixture-license-${i}`,
      );
      mkdirSync(packagePath, { recursive: true });
      writeFileSync(path.join(packagePath, "package.json"), JSON.stringify({
        name: item.name ?? `fixture-license-${i}`,
        version: item.version ?? "1.0.0",
        license: item.license,
      }));
    }
    return spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: "utf8",
      timeout: 15_000,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("owner's nine exact default licenses pass and no broader licenses slip in", () => {
  const names = ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MIT-0", "0BSD", "PostgreSQL", "CC0-1.0"];
  assert.deepEqual([...policy.allowedLicenses].sort(), [...names].sort());
  const result = invoke(names.map((license) => ({ license })));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /9 allowed; 0 explicitly reviewed; 0 denied; 0 unknown/);
});

test("GPL, AGPL, SSPL, BUSL, Elastic and other are rejected, including OR with MIT", () => {
  const licenses = ["GPL-3.0-or-later", "AGPL-3.0", "SSPL-1.0", "BUSL-1.1",
    "Elastic-2.0", "other", "MIT OR GPL-3.0", "(MIT OR AGPL-3.0)"];
  const result = invoke(licenses.map((license) => ({ license })));
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /Dependency license policy FAILED/);
  for (const license of licenses) assert.ok(result.stderr.includes(license), license);
});

test("unknown, uncategorized and unapproved historical dependency licenses fail", () => {
  const licenses = ["UNKNOWN", "NOASSERTION", "BlueOak-1.0.0", "CC-BY-4.0",
    "Python-2.0", "WTFPL"];
  const result = invoke(licenses.map((license) => ({ license })));
  assert.equal(result.status, 1);
  for (const license of licenses) assert.ok(result.stderr.includes(license), license);
});

test("LGPL fails without a package/version/license-matched reviewed entry", () => {
  const pkg = { name: "example-lgpl", version: "1.3.0", license: "LGPL-3.0-or-later" };
  const denied = invoke([pkg]);
  assert.equal(denied.status, 1);
  assert.match(denied.stderr, /review-required license LGPL-3\.0-or-later/);
  const reviewed = invoke([pkg], (p) => ({
    ...p,
    reviewedPackages: {
      ...p.reviewedPackages,
      "example-lgpl@1.3.0": {
        approved: true, license: "LGPL-3.0-or-later",
        rationale: "Reviewed for distribution with notices and relinking compliance obligations.",
      },
    },
  }));
  assert.equal(reviewed.status, 0, reviewed.stderr);
  assert.match(reviewed.stdout, /1 explicitly reviewed/);
  const bumped = invoke([{ ...pkg, version: "1.3.1" }], (p) => ({
    ...p,
    reviewedPackages: { "example-lgpl@1.3.0": {
      approved: true, license: "LGPL-3.0-or-later", rationale: "Version-scoped legal review.",
    } },
  }));
  assert.equal(bumped.status, 1, bumped.stdout);
  const wrongLicense = invoke([pkg], (p) => ({
    ...p,
    reviewedPackages: { "example-lgpl@1.3.0": {
      approved: true, license: "LGPL-2.1-only", rationale: "Wrong license must not be accepted.",
    } },
  }));
  assert.equal(wrongLicense.status, 1, wrongLicense.stdout);
  // An approval keyed only by package name must never authorize every version.
  const unversioned = invoke([pkg], (p) => ({
    ...p,
    reviewedPackages: { "example-lgpl": {
      approved: true, license: "LGPL-3.0-or-later",
      rationale: "Must be tied to exact version and license for review.",
    } },
  }));
  assert.equal(unversioned.status, 1, unversioned.stdout);
});

test("no packages or missing pnpm store must fail closed", () => {
  const empty = invoke([]);
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /No third-party pnpm packages were discovered/);
});
