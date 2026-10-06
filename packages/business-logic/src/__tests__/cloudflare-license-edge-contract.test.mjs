import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const worker = read("infra/cloudflare-license-edge/src/index.js");
const wrangler = read("infra/cloudflare-license-edge/wrangler.jsonc");
const release = read(".github/workflows/release-windows.yml");
const publisher = read(".github/workflows/publish-windows-release.yml");
const desktopLicense = read("apps/desktop/electron/license.ts");
const adminPanel = read("apps/license-admin/src/app/AdminPanel.tsx");
assert.equal(fs.existsSync(path.join(root, "apps/license-admin/src/app/actions.ts")), false);
const browserAdminAuth = read("apps/license-admin/src/app/admin-panel/browser-admin-auth.ts");
const browserAdminApi = read("apps/license-admin/src/app/admin-panel/browser-admin-api.ts");
const browserAdminSession = read("apps/license-admin/src/app/admin-panel/browser-admin-session.ts");
const adminAuthHook = read("apps/license-admin/src/app/admin-panel/useAdminAuthentication.ts");
const adminBootstrapHook = read("apps/license-admin/src/app/admin-panel/useFirstAdminBootstrap.ts");
const adminAuthCard = read("apps/license-admin/src/app/admin-panel/AdminAuthCard.tsx");
const adminPage = read("apps/license-admin/src/app/page.tsx");
const validationBridge = read("supabase/migrations/20261002_cloudflare_license_validate_bridge.sql");
const deactivationBridge = read("supabase/migrations/20261002_cloudflare_license_deactivate_bridge.sql");
const trialBridge = read("supabase/migrations/20261002_cloudflare_trial_register_bridge.sql");
const activationBridge = read("supabase/migrations/20261002_cloudflare_license_activate_bridge.sql");
const adminIdentityBoundary = read("supabase/migrations/20261002_cloudflare_admin_identity_boundary.sql");
const adminLicenseRegistry = read("supabase/migrations/20261002_cloudflare_admin_license_registry.sql");
const adminLicenseStatus = read("supabase/migrations/20261002_cloudflare_admin_license_status.sql");
const adminLicenseIssuance = read("supabase/migrations/20261002_cloudflare_admin_license_issuance.sql");
const adminOfflineActivation = read("supabase/migrations/20261002_cloudflare_admin_offline_activation_atomic.sql");
const adminSupportInbox = read("supabase/migrations/20261002_cloudflare_admin_support_inbox.sql");
const adminSupportUpdate = read("supabase/migrations/20261002_cloudflare_admin_support_update.sql");
const adminCustomerProvisioning = read("supabase/migrations/20261002_cloudflare_admin_customer_provisioning.sql");
const adminBootstrapAuthority = read("supabase/migrations/20261003_cloudflare_admin_bootstrap_authority.sql");
const adminBootstrapSignupReservation = read("supabase/migrations/20261003_cloudflare_admin_bootstrap_signup_reservation.sql");

const EDGE = "https://minarva-biz-license-edge.minarva-biz.workers.dev";

assert.match(worker, /ALLOWED_ROUTES/);
assert.doesNotMatch(worker, /redirect:\s*"error"/);
assert.match(worker, /redirect:\s*"manual"/);
assert.match(worker, /GET \/api\/public-key/);
assert.match(worker, /GET \/api\/update\/manifest/);
assert.match(worker, /GET \/api\/admin\/auth-config/);
assert.match(worker, /GET \/api\/admin\/bootstrap\/status/);
assert.match(worker, /POST \/api\/admin\/bootstrap\/claim/);
assert.match(worker, /POST \/api\/admin\/bootstrap\/signup-reservation/);
assert.match(worker, /nativeAdminBootstrapSignupReservation: true/);
assert.match(worker, /async function adminBootstrapSignupReservationNatively\(request, env, route\)/);
assert.match(worker, /cloudflare_admin_prepare_bootstrap_signup/);
assert.match(worker, /cf-connecting-ip/);
assert.match(worker, /p_client_ip: clientIp/);
assert.match(worker, /BOOTSTRAP_RESERVATION_ACTIVE/);
assert.match(worker, /RATE_LIMITED/);
assert.match(worker, /signupToken/);
assert.match(worker, /\/auth\/v1\/signup/);
assert.match(worker, /signupPassword/);
assert.match(worker, /passwordResetUrl/);
assert.match(worker, /token_sha256/);
assert.match(worker, /nativeAdminBootstrapStatus: true/);
assert.match(worker, /nativeAdminBootstrapClaim: true/);
assert.match(worker, /async function adminBootstrapStatusNatively\(request, env\)/);
assert.match(worker, /async function adminBootstrapClaimNatively\(request, env\)/);
assert.match(worker, /cloudflare_admin_bootstrap_status/);
const bootstrapStatusFn = worker.slice(
  worker.indexOf("async function adminBootstrapStatusNatively"),
  worker.indexOf("async function adminBootstrapClaimNatively"),
);
assert.match(bootstrapStatusFn, /authorization: `Bearer \$\{publishableKey\}`/);
assert.match(bootstrapStatusFn, /p_edge_secret: edgeSecret/);
assert.match(bootstrapStatusFn, /redirect:\s*"manual"/);
assert.doesNotMatch(bootstrapStatusFn, /redirect:\s*"error"/);
assert.match(worker, /cloudflare_admin_claim_first_admin/);
assert.match(worker, /LICENSE_ADMIN_BOOTSTRAP_EMAIL/);
assert.match(worker, /LICENSE_ADMIN_BOOTSTRAP_NAME/);
assert.match(worker, /LICENSE_ADMIN_ALLOWED_ORIGINS/);
assert.match(worker, /function adminCorsHeaders\(request, env, extra = \{\}\)/);
assert.match(worker, /function withAdminCors\(response, request, env\)/);
assert.match(worker, /function adminPreflight\(request, env\)/);
assert.match(worker, /adminCorsConfigured: adminAllowedOrigins\(env\)\.size > 0/);
assert.match(worker, /adminCorsBackend: "cloudflare-origin-allowlist"/);
assert.match(worker, /request\.method === "OPTIONS" && url\.pathname\.startsWith\("\/api\/admin\/"\)/);
assert.match(worker, /nativeAdminAuthConfig: true/);
assert.match(worker, /supabasePublishableKey/);
assert.match(worker, /cache-control": "public, max-age=300"/);
assert.match(worker, /GET \/api\/admin\/me/);
assert.match(worker, /GET \/api\/admin\/licenses/);
assert.match(worker, /POST \/api\/admin\/licenses/);
assert.match(worker, /POST \/api\/admin\/licenses\/offline-activation/);
assert.match(worker, /nativeAdminOfflineActivation: true/);
assert.match(worker, /function parseAdminOfflineActivationBody\(bytes\)/);
assert.match(worker, /async function adminOfflineActivationNatively\(request, env, route\)/);
assert.match(worker, /cloudflare_admin_prepare_offline_activation/);
assert.match(worker, /minarvabiz-license-v1/);
assert.match(worker, /minarvabiz-activation-v1/);
assert.match(worker, /nativeAdminLicenseIssue: true/);
assert.match(worker, /function parseAdminLicenseIssueBody\(bytes\)/);
assert.match(worker, /async function adminLicenseIssueNatively\(request, env, route\)/);
assert.match(worker, /async function signLicenseTokenNatively\(payload, privateKey\)/);
assert.match(worker, /cloudflare_admin_issue_license/);
assert.match(worker, /randomUUID\(\)/);
assert.match(worker, /tokenSha256/);
assert.match(worker, /PATCH \/api\/admin\/licenses\/status/);
assert.match(worker, /nativeAdminLicenseStatus: true/);
assert.match(worker, /function parseAdminLicenseStatusBody\(bytes\)/);
assert.match(worker, /async function adminLicenseStatusNatively\(request, env, route\)/);
assert.match(worker, /cloudflare_admin_set_license_status/);
assert.match(worker, /GET \/api\/admin\/support/);
assert.match(worker, /PATCH \/api\/admin\/support/);
assert.match(worker, /POST \/api\/admin\/customers\/provision/);
assert.match(worker, /nativeAdminCustomerProvision: true/);
assert.match(worker, /function parseAdminCustomerProvisionBody\(bytes\)/);
assert.match(worker, /async function adminCustomerProvisionNatively\(request, env, route\)/);
assert.match(worker, /cloudflare_admin_preflight_customer_provision/);
assert.match(worker, /cloudflare_admin_finalize_customer_provision/);
assert.match(worker, /auth\/v1\/otp/);
assert.match(worker, /create_user: true/);
assert.match(worker, /full_name: parsed\.adminName/);
assert.match(worker, /shop_name: parsed\.shopName/);
assert.match(worker, /customerProvisioningBackend: "cloudflare-native-supabase-magic-link"/);
assert.match(worker, /nativeAdminSupportUpdate: true/);
assert.match(worker, /function parseAdminSupportUpdateBody\(bytes\)/);
assert.match(worker, /async function adminSupportUpdateNatively\(request, env, route\)/);
assert.match(worker, /cloudflare_admin_update_support_request/);
assert.match(worker, /REQUEST_TOO_LARGE/);
assert.match(worker, /UNSUPPORTED_MEDIA_TYPE/);
assert.match(worker, /nativeAdminSupport: true/);
assert.match(worker, /async function adminSupportNatively\(request, env\)/);
assert.match(worker, /cloudflare_admin_list_support_requests/);
assert.match(worker, /nativeAdminLicenses: true/);
assert.match(worker, /async function adminAuthenticatedRpc\(request, env, rpcName, rpcBody = \{\}\)/);
assert.match(worker, /async function adminLicensesNatively\(request, env\)/);
assert.match(worker, /cloudflare_admin_list_licenses/);
assert.match(worker, /nativeAdminMe: true/);
assert.match(worker, /async function adminMeNatively\(request, env\)/);
assert.match(worker, /adminAuthenticatedRpc\(request, env, "cloudflare_admin_me"\)/);
assert.match(worker, /rest\/v1\/rpc\/\$\{rpcName\}/);
assert.match(worker, /x-minarva-admin-backend/);
assert.match(worker, /x-minarva-admin-data/);
assert.match(worker, /POST \/api\/license\/activate/);
assert.match(worker, /nativeActivate: true/);
assert.match(worker, /function signingAuthority\(env\)/);
assert.match(worker, /SIGNING_KDF_DOMAIN/);
assert.match(worker, /LICENSE_EDGE_RPC_SECRET/);
assert.match(worker, /async function signActivationCertificateNatively\(payload, privateKey\)/);
assert.match(worker, /async function activateNatively\(request, env, route, authority\)/);
assert.match(worker, /rest\/v1\/rpc\/cloudflare_prepare_license_activation/);
assert.match(worker, /x-minarva-license-authority/);
assert.match(worker, /POST \/api\/license\/validate/);
assert.match(worker, /nativeValidate: true/);
assert.match(worker, /function parseValidationBody\(bytes\)/);
assert.match(worker, /async function validateNatively\(request, env, route\)/);
assert.match(worker, /rest\/v1\/rpc\/cloudflare_validate_license/);
assert.match(worker, /SUPABASE_PUBLISHABLE_KEY/);
assert.match(worker, /LICENSE_EDGE_RPC_SECRET/);
assert.match(worker, /x-minarva-license-data/);
assert.match(worker, /POST \/api\/license\/deactivate/);
assert.match(worker, /nativeDeactivate: true/);
assert.match(worker, /async function deactivateNatively\(request, env, route\)/);
assert.match(worker, /rest\/v1\/rpc\/cloudflare_deactivate_license/);
assert.match(worker, /POST \/api\/trial\/register/);
assert.match(worker, /nativeTrial: true/);
assert.match(worker, /async function registerTrialNatively\(request, env, route\)/);
assert.match(worker, /rest\/v1\/rpc\/cloudflare_register_trial/);
assert.match(worker, /function trialCorsHeaders\(extra = \{\}\)/);
assert.match(worker, /REQUEST_TOO_LARGE/);
assert.match(worker, /x-minarva-license-edge/);
assert.match(worker, /x-minarva-license-backend/);
assert.match(worker, /cloudflare-native/);
assert.match(worker, /github-release/);
assert.match(worker, /nativeUpdateManifest: true/);
assert.match(worker, /async function updateManifestNatively\(authority\)/);
assert.ok(worker.includes("https://github.com/evertekitsolutions-del/minarvabiz/releases/latest"));
assert.match(worker, /github-release-signed-at-cloudflare/);
assert.match(worker, /Stable installer checksum is unavailable/);
assert.match(worker, /LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE/);
assert.doesNotMatch(worker, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);
assert.doesNotMatch(worker, /LICENSE_PRIVATE_KEY|LICENSE_ORIGIN|onrender\.com/i);

assert.match(wrangler, /minarva-biz-license-edge/);
assert.doesNotMatch(wrangler, /LICENSE_ORIGIN|onrender\.com|UPDATE_MANIFEST_FALLBACK/);
assert.match(wrangler, /SUPABASE_URL/);
assert.match(wrangler, /MINARVA_ONLINE_APP_URL/);
assert.match(wrangler, /SUPABASE_PUBLISHABLE_KEY/);
assert.match(wrangler, /LICENSE_EDGE_RPC_SECRET/);
assert.doesNotMatch(wrangler, /LICENSE_PRIVATE_KEY/);

assert.match(desktopLicense, /typeof result\.data\.activationCertificate === "string"[\s\S]*stored\.activationCertificate/);

assert.match(browserAdminAuth, /beginBrowserNamedAdminLogin/);
assert.match(browserAdminAuth, /beginBrowserFirstAdminSignup/);
assert.match(browserAdminAuth, /createBrowserAdminSignupReservation/);
assert.match(browserAdminAuth, /api\/admin\/bootstrap\/signup-reservation/);
assert.doesNotMatch(
  browserAdminAuth,
  /account_type:\s*"license_admin"/,
  "Browser must not carry the privileged bootstrap routing marker",
);
assert.match(worker, /account_type:\s*"license_admin"/);
assert.doesNotMatch(
  browserAdminAuth,
  /bootstrap_token:/,
  "Browser must never receive or carry the one-time bootstrap capability",
);
assert.match(browserAdminAuth, /resendBrowserFirstAdminConfirmation/);
assert.match(browserAdminAuth, /getBrowserAdminBootstrapStatus/);
assert.match(browserAdminAuth, /claimBrowserFirstAdmin/);
assert.match(browserAdminAuth, /\/token\?grant_type=password/);
assert.doesNotMatch(
  browserAdminAuth,
  /authFetch<PasswordAuthResponse>\([\s\S]*?["']\/signup["']/,
  "Browser must not create the privileged bootstrap Auth user directly",
);
assert.match(browserAdminAuth, /\/resend/);
assert.match(browserAdminAuth, /api\/admin\/bootstrap\/status/);
assert.match(browserAdminAuth, /api\/admin\/bootstrap\/claim/);
assert.match(browserAdminAuth, /\/factors\/\$\{encodeURIComponent\(factorId\)\}\/challenge/);
assert.match(browserAdminAuth, /\/factors\/\$\{encodeURIComponent\(pending\.factorId\)\}\/verify/);
assert.match(browserAdminAuth, /aal !== "aal2"/);
assert.match(browserAdminAuth, /api\/admin\/me/);
assert.doesNotMatch(browserAdminAuth, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|LICENSE_SESSION_SECRET|LICENSE_EDGE_RPC_SECRET/);

assert.match(adminAuthHook, /beginBrowserNamedAdminLogin/);
assert.match(adminAuthHook, /getBrowserAdminBootstrapStatus/);
assert.match(adminAuthHook, /claimBrowserFirstAdmin/);
assert.match(adminAuthHook, /beginBrowserAdminMfaEnrollment/);
assert.match(adminAuthHook, /verifyBrowserAdminMfa/);
assert.match(adminAuthHook, /activateBrowserAdminSession/);
assert.match(adminAuthHook, /loadBrowserAdminDashboard/);
assert.doesNotMatch(adminAuthHook, /adoptCloudflareAdminSession/);

assert.doesNotMatch(adminBootstrapHook, /bootstrapFirstLicenseAdmin|from ["']\.\.\/actions["']/);
assert.match(adminBootstrapHook, /beginBrowserFirstAdminSignup/);
assert.match(adminBootstrapHook, /requestBrowserAdminPasswordSetup/);
assert.doesNotMatch(adminBootstrapHook, /bootstrapPassword/);
assert.match(adminBootstrapHook, /getBrowserAdminBootstrapStatus/);
assert.match(adminAuthCard, /Create first administrator/);
assert.match(adminAuthCard, /Confirm the email/);
assert.match(adminAuthCard, /Send password setup link/);
assert.doesNotMatch(adminAuthCard, /bootstrapPassword|Create password/);
assert.doesNotMatch(adminAuthCard, /Send a one-time setup email/);
assert.doesNotMatch(adminPage, /firstAdminBootstrapStatus|bootstrapAvailable/);

assert.match(browserAdminSession, /sessionStorage\.setItem/);
assert.match(browserAdminSession, /aal === "aal2"/);
assert.match(browserAdminSession, /hasTotp/);
assert.match(browserAdminSession, /\/auth\/v1\/logout\?scope=local/);
assert.doesNotMatch(browserAdminSession, /localStorage/);

for (const route of [
  "/api/admin/me",
  "/api/admin/licenses",
  "/api/admin/licenses/status",
  "/api/admin/licenses/offline-activation",
  "/api/admin/support",
  "/api/admin/customers/provision",
]) {
  assert.ok(browserAdminApi.includes(route), `browser admin API must call ${route}`);
}
assert.match(browserAdminApi, /authorization.*Bearer/si);
assert.doesNotMatch(browserAdminApi, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|LICENSE_PRIVATE_KEY/);

assert.match(adminPanel, /useAdminAuthentication/);
assert.match(adminPanel, /browserDirect/);
assert.doesNotMatch(adminPanel, /bootstrapAvailable/);
assert.match(adminPanel, /issueBrowserLicense/);
assert.match(adminPanel, /setBrowserLicenseStatus/);
assert.match(adminPanel, /createBrowserOfflineActivation/);
assert.doesNotMatch(adminPanel, /adoptCloudflareAdminSession/);
assert.doesNotMatch(adminPanel, /\bloginAdmin\b|\bbeginAdminMfaEnrollment\b|\bverifyAdminMfa\b|\bcancelAdminMfa\b/);

assert.match(worker, /POST \/api\/admin\/emergency\/login/);
assert.match(worker, /POST \/api\/admin\/emergency\/logout/);
assert.match(worker, /async function adminEmergencyLogoutNatively/);
assert.match(worker, /emergencyBearerToken\(request\)/);
assert.match(worker, /cloudflare_admin_emergency_logout/);
assert.doesNotMatch(worker, /export async function loginAdmin\b/);
assert.doesNotMatch(worker, /export async function beginAdminMfaEnrollment\b/);
assert.doesNotMatch(worker, /export async function verifyAdminMfa\b/);
assert.doesNotMatch(worker, /export async function cancelAdminMfa\b/);
assert.doesNotMatch(worker, /export async function adoptCloudflareAdminSession\b/);
assert.doesNotMatch(worker, /export async function logoutAdmin\b/);
assert.doesNotMatch(worker, /from ["']\.\.\/lib\/named-admin["']/);

assert.match(validationBridge, /CREATE SCHEMA IF NOT EXISTS license_private/);
assert.match(validationBridge, /secret_sha256/);
assert.match(validationBridge, /CREATE OR REPLACE FUNCTION public\.cloudflare_validate_license/);
assert.match(validationBridge, /SECURITY DEFINER/);
assert.match(validationBridge, /SET search_path = ''/);
assert.match(validationBridge, /GRANT EXECUTE ON FUNCTION public\.cloudflare_validate_license[\s\S]*TO anon/);
assert.match(validationBridge, /REVOKE ALL ON FUNCTION public\.cloudflare_validate_license[\s\S]*FROM PUBLIC, authenticated, service_role/);

assert.match(deactivationBridge, /CREATE OR REPLACE FUNCTION public\.cloudflare_deactivate_license/);
assert.match(deactivationBridge, /SECURITY DEFINER/);
assert.match(deactivationBridge, /SET search_path = ''/);
assert.match(deactivationBridge, /license-deactivate-ip', v_ip_hash, 60, 15 \* 60/);
assert.match(deactivationBridge, /license-deactivate-device', v_device_hash, 10, 15 \* 60/);
assert.match(deactivationBridge, /GRANT EXECUTE ON FUNCTION public\.cloudflare_deactivate_license[\s\S]*TO anon/);
assert.match(deactivationBridge, /REVOKE ALL ON FUNCTION public\.cloudflare_deactivate_license[\s\S]*FROM PUBLIC, authenticated, service_role/);

assert.match(trialBridge, /CREATE OR REPLACE FUNCTION public\.cloudflare_register_trial/);
assert.match(trialBridge, /SECURITY DEFINER/);
assert.match(trialBridge, /SET search_path = ''/);
assert.match(trialBridge, /trial-register-ip', v_ip_hash, 10, 60 \* 60/);
assert.match(trialBridge, /trial-register-device', v_device_hash, 3, 24 \* 60 \* 60/);
assert.match(trialBridge, /registered_email_pending/);
assert.match(trialBridge, /GRANT EXECUTE ON FUNCTION public\.cloudflare_register_trial[\s\S]*TO anon/);
assert.match(trialBridge, /REVOKE ALL ON FUNCTION public\.cloudflare_register_trial[\s\S]*FROM PUBLIC, authenticated, service_role/);

assert.match(activationBridge, /CREATE OR REPLACE FUNCTION public\.cloudflare_prepare_license_activation/);
assert.match(activationBridge, /SECURITY DEFINER/);
assert.match(activationBridge, /SET search_path = ''/);
assert.match(activationBridge, /license-activate-ip', v_ip_hash, 30, 15 \* 60/);
assert.match(activationBridge, /license-activate-device', v_device_hash, 10, 15 \* 60/);
assert.match(activationBridge, /public\.activate_license_device\(v_license\.id, v_device_id\)/);
assert.match(activationBridge, /GRANT EXECUTE ON FUNCTION public\.cloudflare_prepare_license_activation[\s\S]*TO anon/);
assert.match(activationBridge, /REVOKE ALL ON FUNCTION public\.cloudflare_prepare_license_activation[\s\S]*FROM PUBLIC, authenticated, service_role/);

assert.match(adminIdentityBoundary, /CREATE OR REPLACE FUNCTION public\.cloudflare_admin_me\(\)/);
assert.match(adminIdentityBoundary, /SECURITY DEFINER/);
assert.match(adminIdentityBoundary, /SET search_path = ''/);
assert.match(adminIdentityBoundary, /auth\.uid\(\)/);
assert.match(adminIdentityBoundary, /auth\.jwt\(\)/);
assert.match(adminIdentityBoundary, /v_aal <> 'aal2'/);
assert.match(adminIdentityBoundary, /license_admin_identities/);
assert.match(adminIdentityBoundary, /GRANT EXECUTE ON FUNCTION public\.cloudflare_admin_me\(\) TO authenticated/);
assert.match(adminIdentityBoundary, /REVOKE ALL ON FUNCTION public\.cloudflare_admin_me\(\) FROM PUBLIC, anon, service_role/);

assert.match(adminBootstrapAuthority, /CREATE OR REPLACE FUNCTION public\.cloudflare_admin_bootstrap_status/);
assert.match(adminBootstrapAuthority, /CREATE OR REPLACE FUNCTION public\.cloudflare_admin_claim_first_admin/);
assert.match(adminBootstrapAuthority, /license_private\.edge_credentials/);
assert.match(adminBootstrapAuthority, /auth\.uid\(\)/);
assert.match(adminBootstrapAuthority, /auth\.jwt\(\)/);
assert.match(adminBootstrapAuthority, /v_aal <> 'aal2'/);
assert.match(adminBootstrapAuthority, /email_confirmed_at/);
assert.match(adminBootstrapAuthority, /pg_advisory_xact_lock/);
assert.match(adminBootstrapAuthority, /organization_members/);
assert.match(adminBootstrapAuthority, /public\.profiles/);
assert.match(adminBootstrapAuthority, /admin\.bootstrap\.claim/);
assert.match(adminBootstrapAuthority, /'authority', 'cloudflare'/);
assert.match(adminBootstrapAuthority, /GRANT EXECUTE ON FUNCTION public\.cloudflare_admin_bootstrap_status\(TEXT\)[\s\S]*TO anon/);
assert.match(adminBootstrapAuthority, /REVOKE ALL ON FUNCTION public\.cloudflare_admin_bootstrap_status\(TEXT\)[\s\S]*FROM PUBLIC, authenticated, service_role/);
assert.match(adminBootstrapAuthority, /GRANT EXECUTE ON FUNCTION public\.cloudflare_admin_claim_first_admin\(TEXT, TEXT, TEXT\)[\s\S]*TO authenticated/);
assert.match(adminBootstrapAuthority, /REVOKE ALL ON FUNCTION public\.cloudflare_admin_claim_first_admin\(TEXT, TEXT, TEXT\)[\s\S]*FROM PUBLIC, anon, service_role/);
assert.doesNotMatch(adminBootstrapAuthority, /raw_user_meta_data|user_metadata/);

assert.match(adminBootstrapSignupReservation, /license_private\.admin_bootstrap_signup_reservations/);
assert.equal(
  (adminBootstrapSignupReservation.match(/CREATE OR REPLACE FUNCTION public\.cloudflare_admin_prepare_bootstrap_signup/g) || []).length,
  1,
  "Bootstrap reservation migration must define the public preparation RPC exactly once",
);
assert.equal(
  (adminBootstrapSignupReservation.match(/CREATE OR REPLACE FUNCTION private\.guard_license_admin_bootstrap_signup/g) || []).length,
  1,
  "Bootstrap reservation migration must define the Auth guard exactly once",
);
assert.equal(
  (adminBootstrapSignupReservation.match(/CREATE OR REPLACE FUNCTION private\.bootstrap_new_user/g) || []).length,
  1,
  "Bootstrap reservation migration must redefine tenant bootstrap exactly once",
);
assert.match(adminBootstrapSignupReservation, /cloudflare_admin_prepare_bootstrap_signup/);
assert.match(adminBootstrapSignupReservation, /token_sha256/);
assert.match(adminBootstrapSignupReservation, /interval '10 minutes'/);
assert.match(adminBootstrapSignupReservation, /p_requested_email TEXT/);
assert.match(adminBootstrapSignupReservation, /p_client_ip TEXT DEFAULT 'unknown'/);
assert.match(adminBootstrapSignupReservation, /bootstrap-signup-reservation-ip/);
assert.match(adminBootstrapSignupReservation, /consume_license_rate_limit/);
assert.match(adminBootstrapSignupReservation, /RATE_LIMITED/);
assert.match(adminBootstrapSignupReservation, /BOOTSTRAP_RESERVATION_ACTIVE/);
assert.doesNotMatch(
  adminBootstrapSignupReservation,
  /ON CONFLICT \(email\) DO UPDATE[\s\S]*token_sha256 = EXCLUDED\.token_sha256/,
  "An active first-admin reservation must not be silently rotated by a second request",
);
assert.ok(
  adminBootstrapSignupReservation.indexOf("consume_license_rate_limit") <
    adminBootstrapSignupReservation.indexOf("v_requested_email <> v_bootstrap_email"),
  "Wrong bootstrap-email probes must consume the persistent IP rate-limit budget before comparison",
);
assert.match(
  adminBootstrapSignupReservation,
  /GRANT EXECUTE ON FUNCTION public\.cloudflare_admin_prepare_bootstrap_signup\(TEXT, TEXT, TEXT, TEXT, TEXT\)[\s\S]*TO anon/,
);
assert.match(adminBootstrapSignupReservation, /DELETE FROM license_private\.admin_bootstrap_signup_reservations/);
assert.match(adminBootstrapSignupReservation, /LICENSE_ADMIN_BOOTSTRAP_RESERVATION_REQUIRED/);
assert.match(adminBootstrapSignupReservation, /bootstrap_token/);
assert.match(adminBootstrapSignupReservation, /account_type/);
assert.match(adminBootstrapSignupReservation, /guard_license_admin_bootstrap_signup/);
assert.match(adminBootstrapSignupReservation, /BEFORE INSERT ON auth\.users/);
assert.match(adminBootstrapSignupReservation, /raw_app_meta_data/);
assert.match(adminBootstrapSignupReservation, /minarva_license_admin_bootstrap/);
assert.match(adminBootstrapSignupReservation, /raw_user_meta_data\s*:=/);
assert.match(adminBootstrapSignupReservation, /-\s*'bootstrap_token'/);
assert.doesNotMatch(
  adminBootstrapSignupReservation,
  /IF COALESCE\(NEW\.raw_user_meta_data ->> 'account_type',[\s\S]{0,180}RETURN NEW;/,
  "User-editable account_type alone must never bypass tenant bootstrap",
);
assert.match(
  adminBootstrapSignupReservation,
  /token_sha256 = encode\([\s\S]*extensions\.digest\(v_bootstrap_token, 'sha256'\)/,
  "License-admin tenant-bootstrap bypass must require a one-time token matching a private reservation",
);

assert.match(adminLicenseRegistry, /CREATE OR REPLACE FUNCTION public\.cloudflare_admin_list_licenses\(\)/);
assert.match(adminLicenseRegistry, /public\.cloudflare_admin_me\(\)/);
assert.match(adminLicenseRegistry, /license\.read/);
assert.match(adminLicenseRegistry, /LIMIT 200/);
assert.doesNotMatch(adminLicenseRegistry, /'token'\s*,|'token_sha256'\s*,/);
assert.match(adminLicenseRegistry, /GRANT EXECUTE ON FUNCTION public\.cloudflare_admin_list_licenses\(\)[\s\S]*TO authenticated/);
assert.match(adminLicenseRegistry, /REVOKE ALL ON FUNCTION public\.cloudflare_admin_list_licenses\(\)[\s\S]*FROM PUBLIC, anon, service_role/);

assert.match(adminLicenseStatus, /CREATE OR REPLACE FUNCTION public\.cloudflare_admin_set_license_status/);
assert.match(adminLicenseStatus, /public\.cloudflare_admin_me\(\)/);
assert.match(adminLicenseStatus, /license\.status_manage/);
assert.match(adminLicenseStatus, /FOR UPDATE/);
assert.match(adminLicenseStatus, /UPDATE public\.license_activations/);
assert.match(adminLicenseStatus, /license\.status_change/);
assert.match(adminLicenseStatus, /license_admin_audit_log/);
assert.match(adminLicenseStatus, /license_events/);
assert.match(adminLicenseStatus, /'authority', 'cloudflare'/);
assert.match(adminLicenseStatus, /GRANT EXECUTE ON FUNCTION public\.cloudflare_admin_set_license_status[\s\S]*TO authenticated/);
assert.match(adminLicenseStatus, /REVOKE ALL ON FUNCTION public\.cloudflare_admin_set_license_status[\s\S]*FROM PUBLIC, anon, service_role/);

assert.match(adminLicenseIssuance, /CREATE OR REPLACE FUNCTION public\.cloudflare_admin_issue_license/);
assert.match(adminLicenseIssuance, /public\.cloudflare_admin_me\(\)/);
assert.match(adminLicenseIssuance, /license\.issue/);
assert.match(adminLicenseIssuance, /license_private\.edge_credentials/);
assert.match(adminLicenseIssuance, /extensions\.digest\(v_token, 'sha256'\)/);
assert.match(adminLicenseIssuance, /INVALID_ACTIVATION_LIMIT/);
assert.match(adminLicenseIssuance, /INVALID_FEATURES/);
assert.match(adminLicenseIssuance, /'license\.issue'/);
assert.match(adminLicenseIssuance, /license_admin_audit_log/);
assert.match(adminLicenseIssuance, /license_events/);
assert.match(adminLicenseIssuance, /'authority', 'cloudflare'/);
assert.match(adminLicenseIssuance, /GRANT EXECUTE ON FUNCTION public\.cloudflare_admin_issue_license[\s\S]*TO authenticated/);
assert.match(adminLicenseIssuance, /REVOKE ALL ON FUNCTION public\.cloudflare_admin_issue_license[\s\S]*FROM PUBLIC, anon, service_role/);

assert.match(adminOfflineActivation, /CREATE OR REPLACE FUNCTION public\.cloudflare_admin_prepare_offline_activation/);
assert.match(adminOfflineActivation, /public\.cloudflare_admin_me\(\)/);
assert.match(adminOfflineActivation, /license\.offline_activate/);
assert.match(adminOfflineActivation, /license_activations/);
assert.match(adminOfflineActivation, /v_active_count >= v_license\.activation_limit/);
assert.match(adminOfflineActivation, /ACTIVATION_LIMIT_REACHED/);
assert.match(adminOfflineActivation, /offline-package-created/);
assert.match(adminOfflineActivation, /license_admin_audit_log/);
assert.match(adminOfflineActivation, /license_events/);
assert.match(adminOfflineActivation, /'authority', 'cloudflare'/);
assert.match(adminOfflineActivation, /GRANT EXECUTE ON FUNCTION public\.cloudflare_admin_prepare_offline_activation[\s\S]*TO authenticated/);
assert.match(adminOfflineActivation, /REVOKE ALL ON FUNCTION public\.cloudflare_admin_prepare_offline_activation[\s\S]*FROM PUBLIC, anon, service_role/);


assert.match(adminSupportInbox, /CREATE OR REPLACE FUNCTION public\.cloudflare_admin_list_support_requests\(\)/);
assert.match(adminSupportInbox, /public\.cloudflare_admin_me\(\)/);
assert.match(adminSupportInbox, /support\.read/);
assert.match(adminSupportInbox, /LIMIT 200/);
assert.match(adminSupportInbox, /GRANT EXECUTE ON FUNCTION public\.cloudflare_admin_list_support_requests\(\)[\s\S]*TO authenticated/);
assert.match(adminSupportInbox, /REVOKE ALL ON FUNCTION public\.cloudflare_admin_list_support_requests\(\)[\s\S]*FROM PUBLIC, anon, service_role/);

assert.match(adminSupportUpdate, /CREATE OR REPLACE FUNCTION public\.cloudflare_admin_update_support_request/);
assert.match(adminSupportUpdate, /public\.cloudflare_admin_me\(\)/);
assert.match(adminSupportUpdate, /support\.manage/);
assert.match(adminSupportUpdate, /FOR UPDATE/);
assert.match(adminSupportUpdate, /support\.request\.update/);
assert.match(adminSupportUpdate, /license_admin_audit_log/);
assert.match(adminSupportUpdate, /'authority', 'cloudflare'/);
assert.match(adminSupportUpdate, /GRANT EXECUTE ON FUNCTION public\.cloudflare_admin_update_support_request[\s\S]*TO authenticated/);
assert.match(adminSupportUpdate, /REVOKE ALL ON FUNCTION public\.cloudflare_admin_update_support_request[\s\S]*FROM PUBLIC, anon, service_role/);

assert.match(adminCustomerProvisioning, /DROP TRIGGER IF EXISTS on_auth_user_created_minvarva_org ON auth\.users/);
assert.match(adminCustomerProvisioning, /CREATE OR REPLACE FUNCTION public\.cloudflare_admin_preflight_customer_provision/);
assert.match(adminCustomerProvisioning, /CREATE OR REPLACE FUNCTION public\.cloudflare_admin_finalize_customer_provision/);
assert.match(adminCustomerProvisioning, /public\.cloudflare_admin_me\(\)/);
assert.match(adminCustomerProvisioning, /customer\.provision/);
assert.match(adminCustomerProvisioning, /FROM auth\.users/);
assert.match(adminCustomerProvisioning, /organization_members/);
assert.match(adminCustomerProvisioning, /is_headquarters = true/);
assert.match(adminCustomerProvisioning, /online_customer\.provision/);
assert.match(adminCustomerProvisioning, /PROVISION_EMAIL_FAILED/);
assert.match(adminCustomerProvisioning, /PROVISION_VERIFY_FAILED/);
assert.match(adminCustomerProvisioning, /'authority', 'cloudflare'/);
assert.match(adminCustomerProvisioning, /GRANT EXECUTE ON FUNCTION public\.cloudflare_admin_preflight_customer_provision[\s\S]*TO authenticated/);
assert.match(adminCustomerProvisioning, /GRANT EXECUTE ON FUNCTION public\.cloudflare_admin_finalize_customer_provision[\s\S]*TO authenticated/);
assert.match(adminCustomerProvisioning, /REVOKE ALL ON FUNCTION public\.cloudflare_admin_preflight_customer_provision[\s\S]*FROM PUBLIC, anon, service_role/);
assert.match(adminCustomerProvisioning, /REVOKE ALL ON FUNCTION public\.cloudflare_admin_finalize_customer_provision[\s\S]*FROM PUBLIC, anon, service_role/);

const testRootSecret = "test-root-secret-at-least-32-characters-long";
const seed = createHash("sha256")
  .update("minarvabiz-ed25519-authority-v1\0", "utf8")
  .update(testRootSecret, "utf8")
  .digest();
const privateKey = createPrivateKey({
  key: Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    seed,
  ]),
  format: "der",
  type: "pkcs8",
});
const publicKey = createPublicKey(privateKey);
const message = Buffer.from("authority-self-check", "utf8");
const signature = sign(null, message, privateKey);
assert.equal(verify(null, message, publicKey, signature), true, "derived Ed25519 authority must sign and verify");
const publicKeyHex = Buffer.from(publicKey.export({ format: "der", type: "spki" })).subarray(-32).toString("hex");
assert.match(publicKeyHex, /^[0-9a-f]{64}$/);

assert.ok(release.includes(`VITE_LICENSE_API_URL: "${EDGE}"`));
assert.ok(release.includes(`MINARVA_UPDATE_MANIFEST_URL: "${EDGE}/api/update/manifest"`));
assert.ok(publisher.includes(`const base = "${EDGE}";`));

console.log("Cloudflare license edge contract tests passed");
