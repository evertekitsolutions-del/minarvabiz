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
  process.env.LICENSE_ADMIN_EMERGENCY_LOGIN_ENABLED = "true";
  process.env.LICENSE_ADMIN_EMERGENCY_ACTOR_EMAIL = "operator@example.com";
  process.env.LICENSE_ADMIN_EMERGENCY_ACTOR_NAME = "Emergency Operator";

  const emergencyIdentity = session.emergencyAdminIdentity();
  assert.equal(emergencyIdentity?.email, "operator@example.com");
  assert.equal(emergencyIdentity?.displayName, "Emergency Operator");
  assert.equal(emergencyIdentity?.source, "emergency");
  assert.equal(emergencyIdentity?.role, "admin");
  assert.equal(session.adminSessionTtlSeconds("emergency"), 900);

  const sessionId = "22222222-2222-4222-8222-222222222222";
  const expiresAtMs = now + session.adminSessionTtlSeconds("emergency") * 1000;
  const token = session.createAdminSessionToken(emergencyIdentity, sessionId, expiresAtMs, now);
  assert.match(token, /^v3\./);
  assert.deepEqual(session.readAdminSessionToken(token, now + 1000), {
    sessionId,
    identity: emergencyIdentity,
    expiresAtMs,
  });
  assert.equal(session.validateAdminSessionToken(token, now + 1000), true);
  assert.equal(session.readAdminSessionToken(token.replace(/.$/, token.endsWith("A") ? "B" : "A"), now + 1000), null);

  const sessionSource = await readFile(new URL("../apps/license-admin/src/lib/admin-session.ts", import.meta.url), "utf8");
  assert.doesNotMatch(sessionSource, /ADMIN_MFA_COOKIE|createAdminMfaPendingToken|readAdminMfaPendingToken|adminMfaCookieOptions/);

  const browserAuth = await readFile(new URL("../apps/license-admin/src/app/admin-panel/browser-admin-auth.ts", import.meta.url), "utf8");
  assert.match(browserAuth, /\/token\?grant_type=password/);
  assert.match(browserAuth, /\/factors\/\$\{encodeURIComponent\(factorId\)\}\/challenge/);
  assert.match(browserAuth, /\/factors\/\$\{encodeURIComponent\(pending\.factorId\)\}\/verify/);
  assert.match(browserAuth, /aal !== "aal2"/);
  assert.match(browserAuth, /method === "totp"/);
  assert.match(browserAuth, /api\/admin\/me/);
  assert.doesNotMatch(browserAuth, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|LICENSE_SESSION_SECRET/);

  const actions = await readFile(new URL("../apps/license-admin/src/app/actions.ts", import.meta.url), "utf8");
  assert.match(actions, /export async function loginEmergencyAdmin/);
  assert.doesNotMatch(actions, /export async function firstAdminBootstrapStatus\b/);
  assert.doesNotMatch(actions, /export async function bootstrapFirstLicenseAdmin\b/);
  assert.match(actions, /claims\.identity\.source !== "emergency"/);
  assert.match(actions, /identity\.source !== "emergency" \|\| authMethod !== "emergency"/);
  assert.doesNotMatch(actions, /export async function loginAdmin\b/);
  assert.doesNotMatch(actions, /export async function beginAdminMfaEnrollment\b/);
  assert.doesNotMatch(actions, /export async function verifyAdminMfa\b/);
  assert.doesNotMatch(actions, /export async function cancelAdminMfa\b/);
  assert.doesNotMatch(actions, /export async function adoptCloudflareAdminSession\b/);
  assert.doesNotMatch(actions, /from ["']\.\.\/lib\/named-admin["']/);

  const panel = await readFile(new URL("../apps/license-admin/src/app/AdminPanel.tsx", import.meta.url), "utf8");
  const authCard = await readFile(new URL("../apps/license-admin/src/app/admin-panel/AdminAuthCard.tsx", import.meta.url), "utf8");
  const adminHeader = await readFile(new URL("../apps/license-admin/src/app/admin-panel/AdminHeader.tsx", import.meta.url), "utf8");
  assert.match(authCard, /Administrator email/);
  assert.match(authCard, /Emergency break-glass access/);
  assert.match(authCard, /MFA is required/);
  assert.match(authCard, /Authenticator code/);
  assert.match(panel, /AdminHeader/);
  assert.match(adminHeader, /identity\.displayName/);
  assert.match(adminHeader, /identity\.email/);
  assert.match(adminHeader, /identity\.role/);

  const identityMigration = await readFile(new URL("../supabase/migrations/20260924_license_admin_named_identities.sql", import.meta.url), "utf8");
  assert.match(identityMigration, /REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(identityMigration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(identityMigration, /REVOKE ALL[\s\S]*anon, authenticated/);
  assert.match(identityMigration, /GRANT SELECT[\s\S]*TO service_role/);

  const bootstrapMigration = await readFile(new URL("../supabase/migrations/20260926_first_license_admin_bootstrap.sql", import.meta.url), "utf8");
  assert.match(bootstrapMigration, /account_type'[\s\S]*license_admin/);
  assert.match(bootstrapMigration, /bootstrap_first_license_admin/);
  assert.match(bootstrapMigration, /REVOKE ALL ON FUNCTION[\s\S]*anon, authenticated/);
  assert.match(bootstrapMigration, /GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/);

  const sessionMigration = await readFile(new URL("../supabase/migrations/20260924_license_admin_mfa_sessions.sql", import.meta.url), "utf8");
  assert.match(sessionMigration, /CREATE TABLE IF NOT EXISTS public\.license_admin_sessions/);
  assert.match(sessionMigration, /revoked_at TIMESTAMPTZ/);
  assert.match(sessionMigration, /ENABLE ROW LEVEL SECURITY/);

  console.log("License-admin browser identity + emergency session security smoke PASS");
} finally {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
