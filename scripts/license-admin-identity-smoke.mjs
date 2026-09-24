import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const session = await import("../apps/license-admin/src/lib/admin-session.ts");

const keys = [
  "LICENSE_SESSION_SECRET",
  "LICENSE_ADMIN_SESSION_TTL_SECONDS",
  "LICENSE_ADMIN_EMERGENCY_LOGIN_ENABLED",
  "LICENSE_ADMIN_EMERGENCY_ACTOR_EMAIL",
  "LICENSE_ADMIN_EMERGENCY_ACTOR_NAME",
];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const now = Date.parse("2026-09-24T12:00:00.000Z");

try {
  process.env.LICENSE_SESSION_SECRET = "S".repeat(48);
  process.env.LICENSE_ADMIN_SESSION_TTL_SECONDS = "1800";
  const identity = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "admin@example.com",
    displayName: "Named Administrator",
    source: "supabase",
  };
  const sessionId = "22222222-2222-4222-8222-222222222222";
  const expiresAtMs = now + session.adminSessionTtlSeconds("supabase") * 1000;

  const token = session.createAdminSessionToken(identity, sessionId, expiresAtMs, now);
  assert.match(token, /^v3\./);
  assert.deepEqual(session.readAdminSessionToken(token, now + 1000), {
    sessionId,
    identity,
    expiresAtMs,
  });
  assert.equal(session.validateAdminSessionToken(token, now + 1000), true);
  assert.equal(session.readAdminSessionToken(token.replace(/.$/, token.endsWith("A") ? "B" : "A"), now + 1000), null);
  assert.equal(session.readAdminSessionToken("v2.1.legacy.payload.signature", now), null);

  process.env.LICENSE_ADMIN_EMERGENCY_LOGIN_ENABLED = "true";
  process.env.LICENSE_ADMIN_EMERGENCY_ACTOR_EMAIL = "operator@example.com";
  process.env.LICENSE_ADMIN_EMERGENCY_ACTOR_NAME = "Emergency Operator";
  const emergencyIdentity = session.emergencyAdminIdentity();
  assert.equal(emergencyIdentity?.email, "operator@example.com");
  assert.equal(emergencyIdentity?.displayName, "Emergency Operator");
  assert.equal(emergencyIdentity?.source, "emergency");
  assert.equal(session.adminSessionTtlSeconds("emergency"), 900);

  const namedAdminSource = await readFile(new URL("../apps/license-admin/src/lib/named-admin.ts", import.meta.url), "utf8");
  assert.match(namedAdminSource, /"\/token\?grant_type=password"/);
  assert.match(namedAdminSource, /license_admin_identities/);
  assert.match(namedAdminSource, /status !== "active"/);
  assert.match(namedAdminSource, /verifiedTotpFactorIds/);
  assert.match(namedAdminSource, /\/factors\/\$\{encodeURIComponent\(factorId\)\}\/challenge/);
  assert.match(namedAdminSource, /\/factors\/\$\{encodeURIComponent\(factorId\)\}\/verify/);

  const actions = await readFile(new URL("../apps/license-admin/src/app/actions.ts", import.meta.url), "utf8");
  assert.match(actions, /loginAdmin\(email: string, password: string\)/);
  assert.match(actions, /loginEmergencyAdmin/);
  assert.match(actions, /beginAdminMfaEnrollment/);
  assert.match(actions, /verifyAdminMfa/);
  assert.match(actions, /registerAdminSession/);
  assert.match(actions, /validateRegisteredAdminSession/);
  assert.match(actions, /readAdminSessionToken/);

  const panel = await readFile(new URL("../apps/license-admin/src/app/AdminPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /Administrator email/);
  assert.match(panel, /Emergency break-glass access/);
  assert.match(panel, /MFA is required/);
  assert.match(panel, /Authenticator code/);
  assert.match(panel, /identity\.displayName/);

  const identityMigration = await readFile(new URL("../supabase/migrations/20260924_license_admin_named_identities.sql", import.meta.url), "utf8");
  assert.match(identityMigration, /REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(identityMigration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(identityMigration, /REVOKE ALL[\s\S]*anon, authenticated/);
  assert.match(identityMigration, /GRANT SELECT[\s\S]*TO service_role/);

  const sessionMigration = await readFile(new URL("../supabase/migrations/20260924_license_admin_mfa_sessions.sql", import.meta.url), "utf8");
  assert.match(sessionMigration, /CREATE TABLE IF NOT EXISTS public\.license_admin_sessions/);
  assert.match(sessionMigration, /revoked_at TIMESTAMPTZ/);
  assert.match(sessionMigration, /ENABLE ROW LEVEL SECURITY/);

  console.log("License-admin named identity security smoke PASS");
} finally {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
