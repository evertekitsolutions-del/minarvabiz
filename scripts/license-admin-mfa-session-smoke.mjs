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
  process.env.LICENSE_SESSION_SECRET = "M".repeat(48);
  process.env.LICENSE_ADMIN_SESSION_TTL_SECONDS = "1800";
  process.env.LICENSE_ADMIN_EMERGENCY_LOGIN_ENABLED = "true";
  process.env.LICENSE_ADMIN_EMERGENCY_ACTOR_EMAIL = "operator@example.com";
  process.env.LICENSE_ADMIN_EMERGENCY_ACTOR_NAME = "Emergency Operator";

  const identity = session.emergencyAdminIdentity();
  assert.equal(identity?.source, "emergency");
  const sessionId = "22222222-2222-4222-8222-222222222222";
  const expiresAtMs = now + session.adminSessionTtlSeconds("emergency") * 1000;
  const token = session.createAdminSessionToken(identity, sessionId, expiresAtMs, now);
  assert.match(token, /^v3\./);
  assert.deepEqual(session.readAdminSessionToken(token, now + 1000), {
    sessionId,
    identity,
    expiresAtMs,
  });
  assert.equal(session.readAdminSessionToken(token, expiresAtMs + 1), null);
  assert.equal(session.adminSessionTtlSeconds("emergency"), 900);

  const serverSession = await readFile(new URL("../apps/license-admin/src/lib/admin-session.ts", import.meta.url), "utf8");
  assert.doesNotMatch(serverSession, /ADMIN_MFA_COOKIE|createAdminMfaPendingToken|readAdminMfaPendingToken|adminMfaCookieOptions/);
  assert.doesNotMatch(serverSession, /createCipheriv|createDecipheriv|m1\./);

  const browserAuth = await readFile(new URL("../apps/license-admin/src/app/admin-panel/browser-admin-auth.ts", import.meta.url), "utf8");
  assert.match(browserAuth, /authFetch<MfaEnrollResponse>/);
  assert.ok(browserAuth.includes('"/factors"'));
  assert.match(browserAuth, /\/challenge/);
  assert.match(browserAuth, /\/verify/);
  assert.match(browserAuth, /aal !== "aal2"/);
  assert.match(browserAuth, /method === "totp"/);
  assert.match(browserAuth, /api\/admin\/me/);

  const browserSession = await readFile(new URL("../apps/license-admin/src/app/admin-panel/browser-admin-session.ts", import.meta.url), "utf8");
  assert.match(browserSession, /sessionStorage\.setItem/);
  assert.match(browserSession, /aal === "aal2"/);
  assert.match(browserSession, /hasTotp/);
  assert.match(browserSession, /\/auth\/v1\/logout\?scope=local/);
  assert.doesNotMatch(browserSession, /localStorage/);

  const store = await readFile(new URL("../apps/license-admin/src/lib/admin-session-store.ts", import.meta.url), "utf8");
  assert.match(store, /license_admin_sessions/);
  assert.match(store, /validateRegisteredAdminSession/);
  assert.match(store, /revokeRegisteredAdminSession/);
  assert.match(store, /status !== "active"/);

  const actions = await readFile(new URL("../apps/license-admin/src/app/actions.ts", import.meta.url), "utf8");
  assert.match(actions, /export async function loginEmergencyAdmin/);
  assert.match(actions, /claims\.identity\.source !== "emergency"/);
  assert.doesNotMatch(actions, /beginAdminMfaEnrollment|verifyAdminMfa|adoptCloudflareAdminSession/);

  const authCard = await readFile(new URL("../apps/license-admin/src/app/admin-panel/AdminAuthCard.tsx", import.meta.url), "utf8");
  assert.match(authCard, /Authenticator code/);
  assert.match(authCard, /Set up authenticator/);
  assert.match(authCard, /MFA is required/);

  const migration = await readFile(
    new URL("../supabase/migrations/20260924_license_admin_mfa_sessions.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.license_admin_sessions/);
  assert.match(migration, /revoked_at TIMESTAMPTZ/);
  assert.match(migration, /license_admin_sessions_max_duration/);
  assert.match(migration, /interval '15 minutes'/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL[\s\S]*anon, authenticated/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE[\s\S]*TO service_role/);

  console.log("License-admin browser MFA + emergency revocable-session security smoke PASS");
} finally {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
