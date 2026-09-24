import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const removedWebRoutes = [
  "apps/web/src/app/api/license/activate/route.ts",
  "apps/web/src/app/api/license/deactivate/route.ts",
  "apps/web/src/app/api/license/events/route.ts",
  "apps/web/src/app/api/license/validate/route.ts",
  "apps/web/src/app/api/trial/register/route.ts",
];
for (const rel of removedWebRoutes) {
  assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must live only in license-admin`);
}

function collectFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const webApiText = collectFiles(path.join(root, "apps/web/src/app/api"))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");
for (const secretName of ["LICENSE_PRIVATE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
  assert.equal(webApiText.includes(secretName), false, `public web API must not reference ${secretName}`);
}

const session = read("apps/license-admin/src/lib/admin-session.ts");
assert.match(session, /randomBytes\(32\)/);
assert.match(session, /LICENSE_SESSION_SECRET/);
assert.match(session, /LICENSE_ADMIN_SESSION_TTL_SECONDS/);
assert.match(session, /createAdminSessionToken/);
assert.match(session, /readAdminSessionToken/);
assert.match(session, /createAdminMfaPendingToken/);
assert.match(session, /v3\./);
assert.doesNotMatch(session, /minarvabiz-license-admin-session-v1/);

const actions = read("apps/license-admin/src/app/actions.ts");
assert.match(actions, /consumeRateLimit\(requestHeaders, "admin-login", 5, 15 \* 60, subject\)/);
assert.match(actions, /registerAdminSession/);
assert.match(actions, /validateRegisteredAdminSession/);
assert.match(actions, /revokeRegisteredAdminSession/);
assert.match(actions, /beginAdminMfaEnrollment/);
assert.match(actions, /verifyAdminMfa/);
assert.match(actions, /loginEmergencyAdmin/);

const namedAdmin = read("apps/license-admin/src/lib/named-admin.ts");
assert.match(namedAdmin, /"\/token\?grant_type=password"/);
assert.match(namedAdmin, /license_admin_identities/);
assert.match(namedAdmin, /status !== "active"/);
assert.match(namedAdmin, /verifiedTotpFactorIds/);
assert.match(namedAdmin, /\/challenge/);
assert.match(namedAdmin, /\/verify/);
assert.match(namedAdmin, /aal2/);

const sessionStore = read("apps/license-admin/src/lib/admin-session-store.ts");
assert.match(sessionStore, /license_admin_sessions/);
assert.match(sessionStore, /validateRegisteredAdminSession/);
assert.match(sessionStore, /revokeRegisteredAdminSession/);
assert.match(sessionStore, /status !== "active"/);

const activate = read("apps/license-admin/src/app/api/license/activate/route.ts");
assert.match(activate, /"license-activate-ip", 30, 15 \* 60/);
assert.match(activate, /"license-activate-device", 10, 15 \* 60, deviceId/);
assert.match(activate, /status: 429/);

const trial = read("apps/license-admin/src/app/api/trial/register/route.ts");
assert.match(trial, /"trial-register-ip", 10, 60 \* 60/);
assert.match(trial, /"trial-register-device", 3, 24 \* 60 \* 60, deviceId/);
assert.match(trial, /export function OPTIONS\(\)/);
assert.match(trial, /Access-Control-Allow-Origin/);

const limiter = read("apps/license-admin/src/lib/rate-limit.ts");
assert.match(limiter, /LICENSE_RATE_LIMIT_SECRET/);
assert.match(limiter, /createHmac\("sha256", secret\)/);
assert.match(limiter, /\/rpc\/consume_license_rate_limit/);
assert.match(limiter, /admin-login-backoff\|\$\{String\(subject/);

const rateMigration = read("supabase/migrations/20260924_license_api_rate_limits.sql");
assert.match(rateMigration, /CREATE TABLE IF NOT EXISTS public\.license_api_rate_limits/);
assert.match(rateMigration, /CREATE OR REPLACE FUNCTION public\.consume_license_rate_limit/);
assert.match(rateMigration, /SECURITY DEFINER/);
assert.match(rateMigration, /REVOKE ALL ON FUNCTION public\.consume_license_rate_limit[\s\S]*FROM PUBLIC, anon, authenticated/);
assert.match(rateMigration, /GRANT EXECUTE ON FUNCTION public\.consume_license_rate_limit[\s\S]*TO service_role/);

const identityMigration = read("supabase/migrations/20260924_license_admin_named_identities.sql");
assert.match(identityMigration, /REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
assert.match(identityMigration, /ENABLE ROW LEVEL SECURITY/);
assert.match(identityMigration, /GRANT SELECT ON TABLE public\.license_admin_identities TO service_role/);

const sessionMigration = read("supabase/migrations/20260924_license_admin_mfa_sessions.sql");
assert.match(sessionMigration, /CREATE TABLE IF NOT EXISTS public\.license_admin_sessions/);
assert.match(sessionMigration, /auth_method TEXT NOT NULL CHECK \(auth_method IN \('totp', 'emergency'\)\)/);
assert.match(sessionMigration, /revoked_at TIMESTAMPTZ/);
assert.match(sessionMigration, /ENABLE ROW LEVEL SECURITY/);
assert.match(sessionMigration, /REVOKE ALL ON TABLE public\.license_admin_sessions FROM PUBLIC, anon, authenticated/);
assert.match(sessionMigration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.license_admin_sessions TO service_role/);

const render = read("render.yaml");
assert.match(render, /LICENSE_SESSION_SECRET[\s\S]*generateValue: true/);
assert.match(render, /LICENSE_RATE_LIMIT_SECRET[\s\S]*generateValue: true/);

console.log("license API isolation/session/rate-limit contract tests passed");
