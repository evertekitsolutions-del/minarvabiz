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
assert(edge.data?.paidDependencyIntroduced === false, "edge must not introduce a paid dependency");

const health = await fetchJson("/api/health");
assert(health.response.ok, `origin health HTTP ${health.response.status}`);
assert(health.data?.status === "ok", "edge API health did not report ok");
assert(health.data?.provider === "cloudflare-workers", "edge API health provider mismatch");
assert(health.data?.updateChannel === "github-release", "edge API health update channel mismatch");
assert(health.data?.validationBackend === "cloudflare-native-supabase-rpc", "validation backend is not Cloudflare-native");
assert(health.data?.mutationBackend === "origin-transition", "remaining mutation backend marker mismatch");
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
assert(manifestResult.response.headers.get("x-minarva-license-backend") === "github-release", "update manifest must bypass the transition origin");
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
assert(invalidActivation.response.headers.get("x-minarva-license-backend") === "origin-transition", "activation should still use the transition origin in this milestone");

const invalidValidation = await fetchJson("/api/license/validate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ licenseToken: "", deviceId: "bad" }),
});
assert(invalidValidation.response.status === 400, `invalid validation expected 400, got ${invalidValidation.response.status}`);
assert(invalidValidation.data?.code === "INVALID_REQUEST", "invalid validation response code mismatch");
assert(invalidValidation.response.headers.get("x-minarva-license-edge") === "cloudflare", "validation did not traverse Cloudflare edge");
assert(invalidValidation.response.headers.get("x-minarva-license-backend") === "cloudflare-native", "invalid validation should be rejected natively at the edge");

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

console.log(`CLOUDFLARE_LICENSE_EDGE_LIVE_SMOKE PASS version=${manifest.version}`);
