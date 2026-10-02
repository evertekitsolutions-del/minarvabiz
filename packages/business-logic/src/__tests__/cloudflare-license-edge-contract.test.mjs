import assert from "node:assert/strict";
import fs from "node:fs";
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

const EDGE = "https://minarva-biz-license-edge.minarva-biz.workers.dev";

assert.match(worker, /ALLOWED_ROUTES/);
assert.match(worker, /GET \/api\/public-key/);
assert.match(worker, /GET \/api\/update\/manifest/);
assert.match(worker, /POST \/api\/license\/activate/);
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
assert.match(worker, /REQUEST_TOO_LARGE/);
assert.match(worker, /x-minarva-license-edge/);
assert.match(worker, /x-minarva-license-backend/);
assert.match(worker, /cloudflare-native/);
assert.match(worker, /github-release/);
assert.match(worker, /if \(route\.updateFallback\) \{[\s\S]*return updateFallback\(env\)/);
assert.match(worker, /github\.com\/evertekitsolutions-del\/minarvabiz\/releases\/latest\/download\/MinarvaBiz-update-manifest\.json/);
assert.match(worker, /LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE/);
assert.doesNotMatch(worker, /LICENSE_PRIVATE_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);

assert.match(wrangler, /minarva-biz-license-edge/);
assert.match(wrangler, /LICENSE_ORIGIN/);
assert.match(wrangler, /SUPABASE_URL/);
assert.match(wrangler, /SUPABASE_PUBLISHABLE_KEY/);
assert.match(wrangler, /LICENSE_EDGE_RPC_SECRET/);

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

assert.ok(release.includes(`VITE_LICENSE_API_URL: "${EDGE}"`));
assert.ok(release.includes(`MINARVA_UPDATE_MANIFEST_URL: "${EDGE}/api/update/manifest"`));
assert.ok(publisher.includes(`const base = "${EDGE}";`));

console.log("Cloudflare license edge contract tests passed");
