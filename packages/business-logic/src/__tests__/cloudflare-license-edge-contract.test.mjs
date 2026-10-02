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
const validationBridge = read("supabase/migrations/20261002_cloudflare_license_validate_bridge.sql");
const deactivationBridge = read("supabase/migrations/20261002_cloudflare_license_deactivate_bridge.sql");
const trialBridge = read("supabase/migrations/20261002_cloudflare_trial_register_bridge.sql");
const activationBridge = read("supabase/migrations/20261002_cloudflare_license_activate_bridge.sql");
const adminIdentityBoundary = read("supabase/migrations/20261002_cloudflare_admin_identity_boundary.sql");
const adminLicenseRegistry = read("supabase/migrations/20261002_cloudflare_admin_license_registry.sql");
const adminLicenseStatus = read("supabase/migrations/20261002_cloudflare_admin_license_status.sql");
const adminSupportInbox = read("supabase/migrations/20261002_cloudflare_admin_support_inbox.sql");
const adminSupportUpdate = read("supabase/migrations/20261002_cloudflare_admin_support_update.sql");

const EDGE = "https://minarva-biz-license-edge.minarva-biz.workers.dev";

assert.match(worker, /ALLOWED_ROUTES/);
assert.match(worker, /GET \/api\/public-key/);
assert.match(worker, /GET \/api\/update\/manifest/);
assert.match(worker, /GET \/api\/admin\/me/);
assert.match(worker, /GET \/api\/admin\/licenses/);
assert.match(worker, /PATCH \/api\/admin\/licenses\/status/);
assert.match(worker, /nativeAdminLicenseStatus: true/);
assert.match(worker, /function parseAdminLicenseStatusBody\(bytes\)/);
assert.match(worker, /async function adminLicenseStatusNatively\(request, env, route\)/);
assert.match(worker, /cloudflare_admin_set_license_status/);
assert.match(worker, /GET \/api\/admin\/support/);
assert.match(worker, /PATCH \/api\/admin\/support/);
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
assert.match(wrangler, /SUPABASE_PUBLISHABLE_KEY/);
assert.match(wrangler, /LICENSE_EDGE_RPC_SECRET/);
assert.doesNotMatch(wrangler, /LICENSE_PRIVATE_KEY/);

assert.match(desktopLicense, /typeof result\.data\.activationCertificate === "string"[\s\S]*stored\.activationCertificate/);

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
