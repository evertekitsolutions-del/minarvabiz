import { createHash, createPublicKey, verify } from "node:crypto";

const base = String(process.env.MINARVA_LICENSE_EDGE_URL || "https://minarva-biz-license-edge.minarva-biz.workers.dev").replace(/\/$/, "");

function assert(condition, message) {
  if (!condition) throw new Error(`LICENSE EDGE LIVE SMOKE FAILED: ${message}`);
}

async function fetchJson(path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(75_000),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

function publicKeyFromHex(hex) {
  const raw = Buffer.from(hex, "hex");
  return createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]),
    format: "der",
    type: "spki",
  });
}

const edge = await fetchJson("/edge/health");
assert(edge.response.ok, `edge health HTTP ${edge.response.status}`);
assert(edge.data?.service === "minarva-license-edge", "edge health service marker missing");
assert(edge.data?.provider === "cloudflare-workers", "edge provider marker missing");
assert(edge.data?.validationRpcConfigured === true, "Cloudflare-native validation RPC is not configured");
assert(edge.data?.deactivationRpcConfigured === true, "Cloudflare-native deactivation RPC is not configured");
assert(edge.data?.trialRpcConfigured === true, "Cloudflare-native trial RPC is not configured");
assert(edge.data?.activationSigningConfigured === true, "Cloudflare activation signing authority is not configured");
assert(edge.data?.updateSigningConfigured === true, "Cloudflare update signing authority is not configured");
assert(edge.data?.adminAuthConfigured === true, "Cloudflare admin auth foundation is not configured");
assert(edge.data?.renderDependency === false, "license edge must not depend on Render");
assert(edge.data?.paidDependencyIntroduced === false, "edge must not introduce a paid dependency");

const health = await fetchJson("/api/health");
assert(health.response.ok, `origin health HTTP ${health.response.status}`);
assert(health.data?.status === "ok", "edge API health did not report ok");
assert(health.data?.provider === "cloudflare-workers", "edge API health provider mismatch");
assert(health.data?.updateChannel === "github-release-signed-at-cloudflare", "edge API health update channel mismatch");
assert(health.data?.validationBackend === "cloudflare-native-supabase-rpc", "validation backend is not Cloudflare-native");
assert(health.data?.deactivationBackend === "cloudflare-native-supabase-rpc", "deactivation backend is not Cloudflare-native");
assert(health.data?.trialBackend === "cloudflare-native-supabase-rpc", "trial backend is not Cloudflare-native");
assert(health.data?.activationBackend === "cloudflare-native-supabase-rpc", "activation backend is not Cloudflare-native");
assert(health.data?.mutationBackend === "cloudflare-native", "mutation backend is not Cloudflare-native");
assert(health.data?.renderDependency === false, "API health must report zero Render dependency");
assert(health.data?.adminAuthBackend === "cloudflare-native-supabase-jwt", "admin auth backend is not Cloudflare-native");
assert(health.response.headers.get("x-minarva-license-edge") === "cloudflare", "edge response marker missing");
assert(health.response.headers.get("x-minarva-license-backend") === "cloudflare-native", "health must be served natively by Cloudflare");

const keyResult = await fetchJson("/api/public-key");
assert(keyResult.response.ok, `public-key HTTP ${keyResult.response.status}`);
const keyHex = String(keyResult.data?.publicKeyHex || "").trim().toLowerCase();
assert(/^[0-9a-f]{64}$/.test(keyHex), "public key is not 64 hex characters");
console.log(`PRODUCTION_PUBLIC_KEY_HEX=${keyHex}`);
assert(keyResult.response.headers.get("x-minarva-license-backend") === "cloudflare-native", "public key must be served natively by Cloudflare");

const manifestResult = await fetchJson("/api/update/manifest");
assert(manifestResult.response.ok, `update manifest HTTP ${manifestResult.response.status}`);
const manifest = manifestResult.data || {};
assert(manifest.product === "minarvabiz", "manifest product mismatch");
assert(/^\d+\.\d+\.\d+$/.test(String(manifest.version || "")), "manifest version invalid");
assert(/^https:\/\/github\.com\/evertekitsolutions-del\/minarvabiz\/releases\/download\//.test(String(manifest.installerUrl || "")), "manifest installer URL is not trusted GitHub release URL");
assert(/^[0-9a-f]{64}$/i.test(String(manifest.sha256 || "")), "manifest SHA-256 invalid");
assert(typeof manifest.signature === "string" && manifest.signature.length > 40, "manifest signature missing");
assert(manifestResult.response.headers.get("x-minarva-license-backend") === "cloudflare-native", "update manifest must be signed at Cloudflare");
assert(manifestResult.response.headers.get("x-minarva-update-source") === "github-release", "update source marker mismatch");

const canonical = [
  "minarvabiz-update-v1",
  manifest.product,
  manifest.version,
  manifest.installerUrl,
  String(manifest.sha256).toLowerCase(),
  manifest.publishedAt,
].join("\n");
const signature = Buffer.from(String(manifest.signature).replace(/-/g, "+").replace(/_/g, "/"), "base64");
assert(verify(null, Buffer.from(canonical, "utf8"), publicKeyFromHex(keyHex), signature), "manifest Ed25519 signature verification failed");

const invalidActivation = await fetchJson("/api/license/activate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ licenseToken: "", deviceId: "bad" }),
});
assert(invalidActivation.response.status === 400, `invalid activation expected 400, got ${invalidActivation.response.status}`);
assert(invalidActivation.response.headers.get("x-minarva-license-edge") === "cloudflare", "activation did not traverse Cloudflare edge");
assert(invalidActivation.response.headers.get("x-minarva-license-backend") === "cloudflare-native", "activation must be Cloudflare-native");

const unauthenticatedAdmin = await fetchJson("/api/admin/me");
assert(unauthenticatedAdmin.response.status === 401, `admin me without bearer expected 401, got ${unauthenticatedAdmin.response.status}`);
assert(unauthenticatedAdmin.data?.code === "UNAUTHENTICATED", "admin me unauthenticated code mismatch");
assert(unauthenticatedAdmin.response.headers.get("x-minarva-admin-backend") === "cloudflare-native", "admin auth must terminate at Cloudflare");

const unauthenticatedLicenseRegistry = await fetchJson("/api/admin/licenses");
assert(unauthenticatedLicenseRegistry.response.status === 401, `admin licenses without bearer expected 401, got ${unauthenticatedLicenseRegistry.response.status}`);
assert(unauthenticatedLicenseRegistry.data?.code === "UNAUTHENTICATED", "admin licenses unauthenticated code mismatch");
assert(unauthenticatedLicenseRegistry.response.headers.get("x-minarva-admin-backend") === "cloudflare-native", "admin license registry guard must terminate at Cloudflare");

const unauthenticatedLicenseStatus = await fetchJson("/api/admin/licenses/status", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    licenseId: "LIC-SMOKE-NONEXISTENT",
    status: "suspended",
  }),
});
assert(unauthenticatedLicenseStatus.response.status === 401, `admin license status PATCH without bearer expected 401, got ${unauthenticatedLicenseStatus.response.status}`);
assert(unauthenticatedLicenseStatus.data?.code === "UNAUTHENTICATED", "admin license status unauthenticated code mismatch");
assert(unauthenticatedLicenseStatus.response.headers.get("x-minarva-admin-backend") === "cloudflare-native", "admin license status guard must terminate at Cloudflare");

const unauthenticatedSupport = await fetchJson("/api/admin/support");
assert(unauthenticatedSupport.response.status === 401, `admin support without bearer expected 401, got ${unauthenticatedSupport.response.status}`);
assert(unauthenticatedSupport.data?.code === "UNAUTHENTICATED", "admin support unauthenticated code mismatch");
assert(unauthenticatedSupport.response.headers.get("x-minarva-admin-backend") === "cloudflare-native", "admin support guard must terminate at Cloudflare");

const unauthenticatedSupportUpdate = await fetchJson("/api/admin/support", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    id: "11111111-1111-4111-8111-111111111111",
    status: "in_review",
    assignedTo: "smoke",
    adminNotes: "unauthenticated smoke must not mutate",
  }),
});
assert(unauthenticatedSupportUpdate.response.status === 401, `admin support PATCH without bearer expected 401, got ${unauthenticatedSupportUpdate.response.status}`);
assert(unauthenticatedSupportUpdate.data?.code === "UNAUTHENTICATED", "admin support PATCH unauthenticated code mismatch");
assert(unauthenticatedSupportUpdate.response.headers.get("x-minarva-admin-backend") === "cloudflare-native", "admin support PATCH guard must terminate at Cloudflare");

const invalidValidation = await fetchJson("/api/license/validate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ licenseToken: "", deviceId: "bad" }),
});
assert(invalidValidation.response.status === 400, `invalid validation expected 400, got ${invalidValidation.response.status}`);
assert(invalidValidation.data?.code === "INVALID_REQUEST", "invalid validation response code mismatch");
assert(invalidValidation.response.headers.get("x-minarva-license-edge") === "cloudflare", "validation did not traverse Cloudflare edge");
assert(invalidValidation.response.headers.get("x-minarva-license-backend") === "cloudflare-native", "invalid validation should be rejected natively at the edge");

const invalidDeactivation = await fetchJson("/api/license/deactivate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ licenseToken: "", deviceId: "bad" }),
});
assert(invalidDeactivation.response.status === 400, `invalid deactivation expected 400, got ${invalidDeactivation.response.status}`);
assert(invalidDeactivation.data?.code === "INVALID_REQUEST", "invalid deactivation response code mismatch");
assert(invalidDeactivation.response.headers.get("x-minarva-license-backend") === "cloudflare-native", "invalid deactivation should be rejected natively at the edge");

const trialOptions = await fetchJson("/api/trial/register", {
  method: "OPTIONS",
});
assert(trialOptions.response.status === 204, `trial OPTIONS expected 204, got ${trialOptions.response.status}`);
assert(trialOptions.response.headers.get("access-control-allow-origin") === "*", "trial OPTIONS CORS origin missing");
assert(trialOptions.response.headers.get("x-minarva-license-backend") === "cloudflare-native", "trial OPTIONS must be Cloudflare-native");

const invalidTrial = await fetchJson("/api/trial/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "bad",
    phone: "x",
    organizationName: "",
    address: "",
    deviceId: "bad",
  }),
});
assert(invalidTrial.response.status === 400, `invalid trial expected 400, got ${invalidTrial.response.status}`);
assert(invalidTrial.response.headers.get("x-minarva-license-backend") === "cloudflare-native", "invalid trial must be rejected natively at the edge");
assert(invalidTrial.response.headers.get("access-control-allow-origin") === "*", "trial POST CORS origin missing");

const smokeDeviceId = createHash("sha256")
  .update(`cloudflare-native-validation-smoke-${Date.now()}-${process.pid}`)
  .digest("hex");
const unknownValidation = await fetchJson("/api/license/validate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    licenseToken: "minarvabiz-smoke-nonexistent-license",
    deviceId: smokeDeviceId,
  }),
});
assert(unknownValidation.response.status === 401, `unknown validation expected 401, got ${unknownValidation.response.status}; upstream=${unknownValidation.response.headers.get("x-minarva-license-upstream-status") || "none"}; stage=${unknownValidation.response.headers.get("x-minarva-license-upstream-stage") || "none"}`);
assert(unknownValidation.data?.code === "INVALID_LICENSE", "unknown validation response code mismatch");
assert(unknownValidation.response.headers.get("x-minarva-license-backend") === "cloudflare-native", "valid-shaped validation must bypass the transition origin");
assert(unknownValidation.response.headers.get("x-minarva-license-data") === "supabase-rpc", "valid-shaped validation must round-trip through the scoped Supabase RPC");

const unknownDeactivation = await fetchJson("/api/license/deactivate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    licenseToken: "minarvabiz-smoke-nonexistent-license",
    deviceId: smokeDeviceId,
  }),
});
assert(unknownDeactivation.response.status === 401, `unknown deactivation expected 401, got ${unknownDeactivation.response.status}; upstream=${unknownDeactivation.response.headers.get("x-minarva-license-upstream-status") || "none"}; stage=${unknownDeactivation.response.headers.get("x-minarva-license-upstream-stage") || "none"}`);
assert(unknownDeactivation.data?.code === "INVALID_LICENSE", "unknown deactivation response code mismatch");
assert(unknownDeactivation.response.headers.get("x-minarva-license-backend") === "cloudflare-native", "valid-shaped deactivation must bypass the transition origin");
assert(unknownDeactivation.response.headers.get("x-minarva-license-data") === "supabase-rpc", "valid-shaped deactivation must round-trip through the scoped Supabase RPC");

const unknownActivation = await fetchJson("/api/license/activate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      licenseToken: "minarvabiz-smoke-nonexistent-license",
      deviceId: smokeDeviceId,
    }),
  });
assert(unknownActivation.response.status === 401, `unknown activation expected 401, got ${unknownActivation.response.status}`);
assert(unknownActivation.data?.code === "INVALID_LICENSE", "unknown activation response code mismatch");
assert(unknownActivation.response.headers.get("x-minarva-license-backend") === "cloudflare-native", "native activation must bypass the transition origin");
assert(unknownActivation.response.headers.get("x-minarva-license-data") === "supabase-rpc", "native activation must use the scoped Supabase RPC");

console.log(`CLOUDFLARE_LICENSE_EDGE_LIVE_SMOKE PASS version=${manifest.version}`);
