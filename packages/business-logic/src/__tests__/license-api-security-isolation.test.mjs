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
assert.match(session, /v3\./);
assert.doesNotMatch(session, /minarvabiz-license-admin-session-v1/);
assert.doesNotMatch(
  session,
  /ADMIN_MFA_COOKIE|createAdminMfaPendingToken|readAdminMfaPendingToken|adminMfaCookieOptions|createCipheriv|createDecipheriv/,
  "Server-side pending MFA state must stay retired after browser AAL2 migration",
);

const actions = read("apps/license-admin/src/app/actions.ts");
assert.match(actions, /consumeRateLimit\(requestHeaders, "admin-emergency-login", 5, 15 \* 60, subject\)/);
assert.match(actions, /registerAdminSession/);
assert.match(actions, /validateRegisteredAdminSession/);
assert.match(actions, /revokeRegisteredAdminSession/);
assert.match(actions, /export async function loginEmergencyAdmin/);
assert.match(actions, /claims\.identity\.source !== "emergency"/);
assert.match(actions, /identity\.source !== "emergency" \|\| authMethod !== "emergency"/);
assert.doesNotMatch(actions, /export async function loginAdmin\b/);
assert.doesNotMatch(actions, /export async function beginAdminMfaEnrollment\b/);
assert.doesNotMatch(actions, /export async function verifyAdminMfa\b/);
assert.doesNotMatch(actions, /export async function cancelAdminMfa\b/);
assert.doesNotMatch(actions, /export async function adoptCloudflareAdminSession\b/);
assert.doesNotMatch(actions, /from ["']\.\.\/lib\/named-admin["']/);

const browserAuth = read("apps/license-admin/src/app/admin-panel/browser-admin-auth.ts");
assert.match(browserAuth, /"\/token\?grant_type=password"/);
assert.match(browserAuth, /\/factors\/\$\{encodeURIComponent\(factorId\)\}\/challenge/);
assert.match(browserAuth, /\/factors\/\$\{encodeURIComponent\(pending\.factorId\)\}\/verify/);
assert.match(browserAuth, /aal !== "aal2"/);
assert.match(browserAuth, /method === "totp"/);
assert.match(browserAuth, /api\/admin\/me/);
assert.doesNotMatch(browserAuth, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|LICENSE_SESSION_SECRET/);

const browserSession = read("apps/license-admin/src/app/admin-panel/browser-admin-session.ts");
assert.match(browserSession, /sessionStorage\.setItem/);
assert.match(browserSession, /aal === "aal2"/);
assert.match(browserSession, /hasTotp/);
assert.match(browserSession, /\/auth\/v1\/logout\?scope=local/);
assert.doesNotMatch(browserSession, /localStorage/);

const adminIdentityBoundary = read("supabase/migrations/20261002_cloudflare_admin_identity_boundary.sql");
assert.match(adminIdentityBoundary, /auth\.jwt\(\)/);
assert.match(adminIdentityBoundary, /v_aal <> 'aal2'/);
assert.match(adminIdentityBoundary, /license_admin_identities/);
assert.match(adminIdentityBoundary, /status = 'active'/);

const sessionStore = read("apps/license-admin/src/lib/admin-session-store.ts");
assert.match(sessionStore, /license_admin_sessions/);
assert.match(sessionStore, /validateRegisteredAdminSession/);
assert.match(sessionStore, /revokeRegisteredAdminSession/);
assert.match(sessionStore, /status !== "active"/);

const edgeRuntime = read("infra/cloudflare-license-edge/src/index.js");
const edgeRoutes = edgeRuntime.slice(0, edgeRuntime.indexOf("const DEFAULT_SUPABASE_URL"));
for (const contract of [
  '"POST /api/license/activate", { maxBody: 16 * 1024, nativeActivate: true }',
  '"POST /api/license/validate", { maxBody: 16 * 1024, nativeValidate: true }',
  '"POST /api/license/deactivate", { maxBody: 16 * 1024, nativeDeactivate: true }',
  '"POST /api/trial/register", { maxBody: 16 * 1024, nativeTrial: true }',
]) assert.equal(edgeRoutes.includes(contract), true, `edge route contract missing: ${contract}`);
assert.match(edgeRuntime, /UNSUPPORTED_MEDIA_TYPE/);
assert.match(edgeRuntime, /REQUEST_TOO_LARGE/);
assert.match(edgeRuntime, /cloudflare_license_activate/);
assert.match(edgeRuntime, /cloudflare_license_validate/);
assert.match(edgeRuntime, /cloudflare_license_deactivate/);
assert.match(edgeRuntime, /cloudflare_trial_register/);

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

const sessionIndexMigration = read("supabase/migrations/20260924_license_admin_session_auth_user_index.sql");
assert.match(sessionIndexMigration, /idx_license_admin_sessions_auth_user_id/);
assert.match(sessionIndexMigration, /license_admin_sessions\(auth_user_id\)/);

assert.equal(fs.existsSync(path.join(root, "render.yaml")), false, "Render service definition must stay retired after browser-edge cutover");
const licenseAdminPackage = JSON.parse(read("apps/license-admin/package.json"));
assert.equal(licenseAdminPackage.scripts.build, "next build");
assert.equal(read("apps/license-admin/next.config.ts").includes('output: "export"'), true);
assert.equal(fs.existsSync(path.join(root, "apps/license-admin/src/middleware.ts")), false);

console.log("license API isolation/session/rate-limit contract tests passed");
