import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildOfflineActivationPackage,
  isLicenseStatusAction,
  LICENSE_STATUS_ACTIONS,
} from "../apps/license-admin/src/app/action-contract.ts";

for (const status of ["active", "suspended", "revoked", "deactivated"]) {
  assert.equal(isLicenseStatusAction(status), true);
}
for (const status of ["deleted", "pending", "", null, 123]) {
  assert.equal(isLicenseStatusAction(status), false);
}
assert.deepEqual([...LICENSE_STATUS_ACTIONS], ["active", "suspended", "revoked", "deactivated"]);

const exportedPackage = buildOfflineActivationPackage({
  licenseToken: "license-token",
  activationCertificate: "activation-certificate",
  licenseId: "LIC-TEST-001",
  activationId: "ACT-TEST-001",
  deviceId: "a".repeat(64),
  issuedAt: "2026-09-25T00:00:00.000Z",
  expiresAt: null,
});
const importedPackage = JSON.parse(JSON.stringify(exportedPackage));
assert.deepEqual(importedPackage, exportedPackage);
assert.equal(importedPackage.format, "minarvabiz-license-v1");
assert.equal(importedPackage.product, "minarvabiz");
assert.equal(importedPackage.deviceId.length, 64);

const actions = await readFile(
  new URL("../apps/license-admin/src/app/actions.ts", import.meta.url),
  "utf8",
);

for (const authAction of [
  "loginAdmin",
  "beginAdminMfaEnrollment",
  "verifyAdminMfa",
  "cancelAdminMfa",
  "loginEmergencyAdmin",
  "logoutAdmin",
]) {
  assert.match(actions, new RegExp(`export async function ${authAction}\\b`));
}

for (const registryAction of [
  "listLicenses",
  "createCommercialLicense",
  "createOfflineActivationPackage",
  "setLicenseStatus",
]) {
  assert.match(actions, new RegExp(`export async function ${registryAction}\\b`));
}

assert.match(
  actions,
  /if \(!activationResult\.ok\) return \{ ok: false, error: activationResult\.error \|\| "License activation lookup failed\.", identity, licenses: \[\] as any\[\] \};/,
  "Registry read must fail closed when activation lookup fails",
);
assert.match(
  actions,
  /if \(!cleanLicenseId \|\| !isLicenseStatusAction\(status\)\) return \{ ok: false, error: "Invalid license status\." \};/,
  "Status writes must validate runtime input before the database PATCH",
);
assert.match(actions, /buildOfflineActivationPackage\(\{/);
assert.match(actions, /filename: `MinarvaBiz-\$\{license\.license_id\}-\$\{deviceId\.slice\(0, 8\)\}\.lic`/);

const panel = await readFile(
  new URL("../apps/license-admin/src/app/AdminPanel.tsx", import.meta.url),
  "utf8",
);
assert.match(panel, /loginAdmin\(email, password\)/);
assert.match(panel, /createCommercialLicense\(\{/);
assert.match(panel, /setLicenseStatus\(licenseId, value\)/);
assert.match(panel, /createOfflineActivationPackage\(\{/);
assert.match(panel, /JSON\/download|Blob|createObjectURL/);

console.log("License-admin auth/CRUD/error/import-export smoke PASS");
