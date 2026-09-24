import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const session = await import("../apps/license-admin/src/lib/admin-session.ts");
const backoff = await import("../apps/license-admin/src/lib/login-backoff.ts");

const envKeys = [
  "LICENSE_ADMIN_EMERGENCY_LOGIN_ENABLED",
  "LICENSE_API_SECRET",
  "LICENSE_API_SECRET_PREVIOUS",
  "LICENSE_API_SECRET_PREVIOUS_VALID_UNTIL",
  "LICENSE_ADMIN_EMERGENCY_ACTOR_EMAIL",
  "LICENSE_ADMIN_EMERGENCY_ACTOR_NAME",
];
const original = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const now = Date.parse("2026-09-24T12:00:00.000Z");
const current = "C".repeat(48);
const previous = "P".repeat(48);

try {
  process.env.LICENSE_ADMIN_EMERGENCY_LOGIN_ENABLED = "true";
  process.env.LICENSE_API_SECRET = current;
  process.env.LICENSE_API_SECRET_PREVIOUS = previous;
  process.env.LICENSE_API_SECRET_PREVIOUS_VALID_UNTIL = new Date(now + 30 * 60 * 1000).toISOString();
  process.env.LICENSE_ADMIN_EMERGENCY_ACTOR_EMAIL = "operator@example.com";
  process.env.LICENSE_ADMIN_EMERGENCY_ACTOR_NAME = "Emergency Operator";

  let status = session.emergencyAdminCredentialStatus(now);
  assert.equal(status.enabled, true);
  assert.equal(status.currentConfigured, true);
  assert.equal(status.previousActive, true);
  assert.equal(status.actorConfigured, true);
  assert.equal(session.verifyEmergencyAdminCredential(current, now), "current");
  assert.equal(session.verifyEmergencyAdminCredential(previous, now), "previous");
  assert.equal(session.verifyEmergencyAdminCredential("wrong", now), null);

  process.env.LICENSE_API_SECRET_PREVIOUS_VALID_UNTIL = new Date(now - 1).toISOString();
  status = session.emergencyAdminCredentialStatus(now);
  assert.equal(status.previousActive, false);
  assert.equal(session.verifyEmergencyAdminCredential(previous, now), null);
  assert.equal(session.verifyEmergencyAdminCredential(current, now), "current");

  process.env.LICENSE_API_SECRET_PREVIOUS_VALID_UNTIL = new Date(now + session.MAX_PREVIOUS_SECRET_GRACE_MS + 1).toISOString();
  status = session.emergencyAdminCredentialStatus(now);
  assert.equal(status.previousActive, false, "previous credential grace must be capped at 24 hours");

  process.env.LICENSE_ADMIN_EMERGENCY_LOGIN_ENABLED = "false";
  assert.equal(session.verifyEmergencyAdminCredential(current, now), null, "shared-secret login must be opt-in");

  process.env.LICENSE_ADMIN_EMERGENCY_LOGIN_ENABLED = "true";
  process.env.LICENSE_API_SECRET = "too-short";
  assert.equal(session.emergencyAdminCredentialStatus(now).currentConfigured, false);
  assert.equal(session.verifyEmergencyAdminCredential("too-short", now), null);

  assert.equal(backoff.adminLoginBackoffSeconds(1), 2);
  assert.equal(backoff.adminLoginBackoffSeconds(2), 4);
  assert.equal(backoff.adminLoginBackoffSeconds(8), 256);
  assert.equal(backoff.adminLoginBackoffSeconds(9), 300);
  assert.equal(backoff.adminLoginBackoffSeconds(999), 300);

  const actions = await readFile(new URL("../apps/license-admin/src/app/actions.ts", import.meta.url), "utf8");
  assert.match(actions, /checkAdminLoginBackoff/);
  assert.match(actions, /recordAdminLoginFailure/);
  assert.match(actions, /clearAdminLoginFailures/);
  assert.match(actions, /verifyEmergencyAdminCredential/);
  assert.doesNotMatch(actions, /adminPassword\(/);

  const migration = await readFile(
    new URL("../supabase/migrations/20260924_license_admin_emergency_login_backoff.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /check_license_admin_login_backoff/);
  assert.match(migration, /record_license_admin_login_failure/);
  assert.match(migration, /clear_license_admin_login_failures/);
  assert.match(migration, /GRANT EXECUTE[\s\S]*TO service_role/);
  assert.match(migration, /POWER\(2::NUMERIC/);
  assert.match(migration, /LEAST\([\s\S]*300/);

  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(envExample, /LICENSE_ADMIN_EMERGENCY_LOGIN_ENABLED=false/);
  assert.match(envExample, /LICENSE_API_SECRET_PREVIOUS=/);
  assert.match(envExample, /LICENSE_API_SECRET_PREVIOUS_VALID_UNTIL=/);

  console.log("License-admin emergency shared-secret security smoke PASS");
} finally {
  for (const key of envKeys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
