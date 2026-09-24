import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const session = await import("../apps/license-admin/src/lib/admin-session.ts");

const keys = ["LICENSE_SESSION_SECRET", "LICENSE_ADMIN_SESSION_TTL_SECONDS"];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const now = Date.parse("2026-09-24T12:00:00.000Z");

try {
  process.env.LICENSE_SESSION_SECRET = "M".repeat(48);
  process.env.LICENSE_ADMIN_SESSION_TTL_SECONDS = "1800";

  const identity = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "admin@example.com",
    displayName: "Named Administrator",
    source: "supabase",
    role: "admin",
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
  assert.equal(session.readAdminSessionToken(token, expiresAtMs + 1), null);
  assert.equal(session.adminSessionTtlSeconds("supabase"), 1800);
  assert.equal(session.adminSessionTtlSeconds("emergency"), 900);

  const pending = {
    identity,
    accessToken: "eyJ." + "a".repeat(160) + ".sig",
    mode: "challenge",
    factorId: "33333333-3333-4333-8333-333333333333",
    challengeId: "44444444-4444-4444-8444-444444444444",
  };
  const pendingToken = session.createAdminMfaPendingToken(pending, now);
  assert.match(pendingToken, /^m1\./);
  assert.equal(pendingToken.includes(pending.accessToken), false, "pending MFA state must be encrypted");
  assert.deepEqual(session.readAdminMfaPendingToken(pendingToken, now + 1000), pending);
  assert.equal(
    session.readAdminMfaPendingToken(pendingToken.replace(/.$/, pendingToken.endsWith("A") ? "B" : "A"), now + 1000),
    null,
  );
  assert.equal(session.readAdminMfaPendingToken(pendingToken, now + 6 * 60 * 1000), null);

  const namedAdmin = await readFile(new URL("../apps/license-admin/src/lib/named-admin.ts", import.meta.url), "utf8");
  assert.match(namedAdmin, /authFetch<MfaEnrollResponse>/);
  assert.ok(namedAdmin.includes('"/factors"'));
  assert.match(namedAdmin, /\/challenge/);
  assert.match(namedAdmin, /\/verify/);
  assert.match(namedAdmin, /aal2/);
  assert.match(namedAdmin, /method === "totp"/);

  const store = await readFile(new URL("../apps/license-admin/src/lib/admin-session-store.ts", import.meta.url), "utf8");
  assert.match(store, /license_admin_sessions/);
  assert.match(store, /validateRegisteredAdminSession/);
  assert.match(store, /revokeRegisteredAdminSession/);
  assert.match(store, /status !== "active"/);

  const actions = await readFile(new URL("../apps/license-admin/src/app/actions.ts", import.meta.url), "utf8");
  assert.match(actions, /beginAdminMfaEnrollment/);
  assert.match(actions, /verifyAdminMfa/);
  assert.match(actions, /registerAdminSession/);
  assert.match(actions, /validateRegisteredAdminSession/);
  assert.match(actions, /revokeRegisteredAdminSession/);

  const panel = await readFile(new URL("../apps/license-admin/src/app/AdminPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /Authenticator code/);
  assert.match(panel, /Set up authenticator/);
  assert.match(panel, /MFA is required/);

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

  const indexMigration = await readFile(
    new URL("../supabase/migrations/20260924_license_admin_sessions_auth_user_index.sql", import.meta.url),
    "utf8",
  );
  assert.match(indexMigration, /CREATE INDEX IF NOT EXISTS idx_license_admin_sessions_auth_user_id/);
  assert.match(indexMigration, /ON public\.license_admin_sessions\(auth_user_id\)/);
  assert.match(indexMigration, /WHERE auth_user_id IS NOT NULL/);

  console.log("License-admin MFA/revocable-session security smoke PASS");
} finally {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
