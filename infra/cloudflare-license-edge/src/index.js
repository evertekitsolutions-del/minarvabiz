import { Buffer } from "node:buffer";
import { createHash, createPrivateKey, createPublicKey, randomUUID, sign as nodeSign, verify as nodeVerify } from "node:crypto";

const ALLOWED_ROUTES = new Map([
  ["GET /api/health", { maxBody: 0 }],
  ["GET /api/public-key", { maxBody: 0 }],
  ["GET /api/update/manifest", { maxBody: 0, nativeUpdateManifest: true }],
  ["GET /api/admin/auth-config", { maxBody: 0, nativeAdminAuthConfig: true }],
  ["GET /api/admin/bootstrap/status", { maxBody: 0, nativeAdminBootstrapStatus: true }],
  ["POST /api/admin/bootstrap/claim", { maxBody: 0, nativeAdminBootstrapClaim: true }],
  ["GET /api/admin/me", { maxBody: 0, nativeAdminMe: true }],
  ["GET /api/admin/licenses", { maxBody: 0, nativeAdminLicenses: true }],
  ["POST /api/admin/licenses", { maxBody: 16 * 1024, nativeAdminLicenseIssue: true }],
  ["POST /api/admin/licenses/offline-activation", { maxBody: 8 * 1024, nativeAdminOfflineActivation: true }],
  ["PATCH /api/admin/licenses/status", { maxBody: 8 * 1024, nativeAdminLicenseStatus: true }],
  ["GET /api/admin/support", { maxBody: 0, nativeAdminSupport: true }],
  ["PATCH /api/admin/support", { maxBody: 16 * 1024, nativeAdminSupportUpdate: true }],
  ["POST /api/admin/customers/provision", { maxBody: 16 * 1024, nativeAdminCustomerProvision: true }],
  ["POST /api/license/activate", { maxBody: 16 * 1024, nativeActivate: true }],
  ["POST /api/license/validate", { maxBody: 16 * 1024, nativeValidate: true }],
  ["POST /api/license/deactivate", { maxBody: 16 * 1024, nativeDeactivate: true }],
  ["POST /api/trial/register", { maxBody: 16 * 1024, nativeTrial: true }],
  ["OPTIONS /api/trial/register", { maxBody: 0 }],
]);

const DEFAULT_SUPABASE_URL = "https://wmjgefbaliuwmaxyzxkq.supabase.co";
const DEFAULT_ONLINE_APP_URL = "https://minarvabiz-steel.vercel.app";
const GITHUB_LATEST_RELEASE =
  "https://github.com/evertekitsolutions-del/minarvabiz/releases/latest";
const GITHUB_RELEASE_DOWNLOAD_BASE =
  "https://github.com/evertekitsolutions-del/minarvabiz/releases/download";
const SIGNING_KDF_DOMAIN = "minarvabiz-ed25519-authority-v1\0";
const DEVICE_RE = /^[a-f0-9]{64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{6,50}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPORT_REQUEST_STATUSES = new Set(["new", "in_review", "planned", "resolved", "rejected", "duplicate"]);
const LICENSE_STATUS_ACTIONS = new Set(["active", "suspended", "revoked", "deactivated"]);
const LICENSE_PLANS = new Set(["trial", "basic", "professional", "business", "enterprise"]);
const LICENSE_EDITIONS = new Set(["online", "offline", "hybrid"]);
const LICENSE_FEATURE_KEYS = [
  "sales", "customers", "inventory", "tailoring", "orders", "laundry", "reports",
  "staff", "advancedReports", "cloudSync", "multiUser", "multiBranch", "apiAccess",
];
const PLAN_MAX_DEVICES = {
  trial: 1,
  basic: 1,
  professional: 2,
  business: 5,
  enterprise: -1,
};
const PLAN_FEATURES = {
  trial: {
    sales: true, customers: true, inventory: true, tailoring: true, orders: true,
    laundry: true, reports: true, staff: true, advancedReports: true, cloudSync: true,
    multiUser: true, multiBranch: true, apiAccess: true,
  },
  basic: {
    sales: true, customers: true, inventory: true, tailoring: false, orders: false,
    laundry: false, reports: false, staff: false, advancedReports: false, cloudSync: false,
    multiUser: false, multiBranch: false, apiAccess: false,
  },
  professional: {
    sales: true, customers: true, inventory: true, tailoring: true, orders: true,
    laundry: true, reports: true, staff: false, advancedReports: false, cloudSync: false,
    multiUser: false, multiBranch: false, apiAccess: false,
  },
  business: {
    sales: true, customers: true, inventory: true, tailoring: true, orders: true,
    laundry: true, reports: true, staff: true, advancedReports: true, cloudSync: true,
    multiUser: true, multiBranch: false, apiAccess: false,
  },
  enterprise: {
    sales: true, customers: true, inventory: true, tailoring: true, orders: true,
    laundry: true, reports: true, staff: true, advancedReports: true, cloudSync: true,
    multiUser: true, multiBranch: true, apiAccess: true,
  },
};

function signingAuthority(env) {
  const rootSecret = String(env.LICENSE_EDGE_RPC_SECRET || "").trim();
  if (rootSecret.length < 32) return null;

  try {
    const seed = createHash("sha256")
      .update(SIGNING_KDF_DOMAIN, "utf8")
      .update(rootSecret, "utf8")
      .digest();
    const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
    const privateKey = createPrivateKey({
      key: Buffer.concat([pkcs8Prefix, seed]),
      format: "der",
      type: "pkcs8",
    });
    const publicDer = createPublicKey(privateKey).export({ format: "der", type: "spki" });
    const publicKeyHex = Buffer.from(publicDer).subarray(-32).toString("hex");

    const check = Buffer.from("minarvabiz-cloudflare-signing-authority-check-v1", "utf8");
    const signature = nodeSign(null, check, privateKey);
    if (!nodeVerify(null, check, createPublicKey(privateKey), signature)) return null;

    return { privateKey, publicKeyHex };
  } catch {
    return null;
  }
}

function base64Url(data) {
  return Buffer.from(data).toString("base64url");
}

async function signActivationCertificateNatively(payload, privateKey) {
  const body = base64Url(JSON.stringify(payload));
  const signature = nodeSign(null, Buffer.from(body, "utf8"), privateKey);
  return `${body}.${signature.toString("base64url")}`;
}

async function signLicenseTokenNatively(payload, privateKey) {
  const body = base64Url(JSON.stringify(payload));
  const signature = nodeSign(null, Buffer.from(body, "utf8"), privateKey);
  return `${body}.${signature.toString("base64url")}`;
}

function canonicalUpdateManifest(input) {
  return [
    "minarvabiz-update-v1",
    input.product,
    input.version,
    input.installerUrl,
    String(input.sha256).toLowerCase(),
    input.publishedAt,
  ].join("\n");
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-minarva-license-edge": "cloudflare",
      ...headers,
    },
  });
}

function normalizeAdminOrigin(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol === "https:") return url.origin;
    if (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    ) return url.origin;
    return null;
  } catch {
    return null;
  }
}

function adminAllowedOrigins(env) {
  const configured = String(env.LICENSE_ADMIN_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => normalizeAdminOrigin(value))
    .filter(Boolean);
  return new Set(configured);
}

function adminCorsHeaders(request, env, extra = {}) {
  const origin = normalizeAdminOrigin(request.headers.get("origin") || "");
  if (!origin || !adminAllowedOrigins(env).has(origin)) return { ...extra };
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    "access-control-allow-headers": "Authorization, Content-Type, Accept",
    "access-control-max-age": "86400",
    "vary": "Origin",
    ...extra,
  };
}

function withAdminCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(adminCorsHeaders(request, env))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function adminPreflight(request, env) {
  const origin = normalizeAdminOrigin(request.headers.get("origin") || "");
  if (!origin || !adminAllowedOrigins(env).has(origin)) {
    return json({ ok: false, code: "ORIGIN_NOT_ALLOWED" }, 403, {
      "x-minarva-admin-backend": "cloudflare-native",
    });
  }
  return new Response(null, {
    status: 204,
    headers: adminCorsHeaders(request, env, {
      "x-minarva-license-edge": "cloudflare",
      "x-minarva-admin-backend": "cloudflare-native",
    }),
  });
}

function allowedOrigin(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function supabaseOrigin(value) {
  const origin = allowedOrigin(value);
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (!url.hostname.endsWith(".supabase.co")) return null;
    return origin;
  } catch {
    return null;
  }
}

async function readRequestBody(request, maxBody) {
  if (!maxBody) return null;
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > maxBody) {
    return { tooLarge: true, bytes: null };
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maxBody) return { tooLarge: true, bytes: null };
  return { tooLarge: false, bytes };
}

function parseValidationBody(bytes) {
  try {
    const raw = new TextDecoder().decode(bytes || new Uint8Array());
    const body = JSON.parse(raw);
    const licenseToken = typeof body?.licenseToken === "string" ? body.licenseToken.trim().slice(0, 2001) : "";
    const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim().slice(0, 64).toLowerCase() : "";
    if (!licenseToken || licenseToken.length > 2000 || !DEVICE_RE.test(deviceId)) return null;
    return { licenseToken, deviceId };
  } catch {
    return null;
  }
}

function trialCorsHeaders(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Accept",
    "access-control-max-age": "86400",
    ...extra,
  };
}

function normalizeTrialPhone(value) {
  const raw = String(value || "").trim();
  const plus = raw.startsWith("+") ? "+" : "";
  return plus + raw.replace(/\D/g, "");
}

function parseTrialBody(bytes) {
  try {
    const raw = new TextDecoder().decode(bytes || new Uint8Array());
    const body = JSON.parse(raw);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 255) : "";
    const phone = normalizeTrialPhone(typeof body?.phone === "string" ? body.phone.slice(0, 50) : "");
    const organizationName =
      typeof body?.organizationName === "string" ? body.organizationName.trim().slice(0, 201) : "";
    const address = typeof body?.address === "string" ? body.address.trim().slice(0, 501) : "";
    const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim().toLowerCase().slice(0, 64) : "";

    if (!EMAIL_RE.test(email) || email.length > 254) {
      return { error: "A valid email address is required." };
    }
    if (!PHONE_RE.test(phone)) {
      return { error: "A valid phone number is required." };
    }
    if (!organizationName || organizationName.length > 200) {
      return { error: "Organization name is required." };
    }
    if (!address || address.length > 500) {
      return { error: "Address is required." };
    }
    if (!DEVICE_RE.test(deviceId)) {
      return { error: "Device registration is required." };
    }
    return { email, phone, organizationName, address, deviceId };
  } catch {
    return { error: "Invalid trial registration request." };
  }
}

async function activateNatively(request, env, route, authority) {
  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return json(
      { ok: false, code: "UNSUPPORTED_MEDIA_TYPE" },
      415,
      { "x-minarva-license-backend": "cloudflare-native" },
    );
  }

  const body = await readRequestBody(request, route.maxBody);
  if (body?.tooLarge) {
    return json(
      { ok: false, code: "REQUEST_TOO_LARGE" },
      413,
      { "x-minarva-license-backend": "cloudflare-native" },
    );
  }

  const parsed = parseValidationBody(body?.bytes);
  if (!parsed) {
    return json(
      { ok: false, code: "INVALID_REQUEST" },
      400,
      { "x-minarva-license-backend": "cloudflare-native" },
    );
  }

  const apiOrigin = supabaseOrigin(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  const edgeSecret = String(env.LICENSE_EDGE_RPC_SECRET || "").trim();
  if (!apiOrigin || !publishableKey || edgeSecret.length < 32) {
    return json(
      { ok: false, code: "LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE" },
      503,
      { "x-minarva-license-backend": "cloudflare-native" },
    );
  }

  const clientIp = String(request.headers.get("cf-connecting-ip") || "unknown").trim().slice(0, 200) || "unknown";

  try {
    const response = await fetch(`${apiOrigin}/rest/v1/rpc/cloudflare_prepare_license_activation`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${publishableKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        p_edge_secret: edgeSecret,
        p_license_token: parsed.licenseToken,
        p_device_id: parsed.deviceId,
        p_client_ip: clientIp,
      }),
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      return json(
        { ok: false, code: "LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE" },
        503,
        {
          "x-minarva-license-backend": "cloudflare-native",
          "x-minarva-license-upstream-status": String(response.status),
          "x-minarva-license-upstream-stage": "supabase-http",
        },
      );
    }

    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return json(
        { ok: false, code: "LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE" },
        503,
        {
          "x-minarva-license-backend": "cloudflare-native",
          "x-minarva-license-upstream-stage": "supabase-json",
        },
      );
    }

    const rawStatus = Number(data.httpStatus);
    const status = Number.isInteger(rawStatus) && rawStatus >= 200 && rawStatus <= 599 ? rawStatus : 503;
    const retryAfter = Number(data.retryAfterSeconds);
    const output = { ...data };
    delete output.httpStatus;
    delete output.retryAfterSeconds;

    if (!output.ok) {
      const headers = {
        "x-minarva-license-backend": "cloudflare-native",
        "x-minarva-license-data": "supabase-rpc",
      };
      if (status === 429 && Number.isFinite(retryAfter) && retryAfter > 0) {
        headers["retry-after"] = String(Math.ceil(retryAfter));
      }
      return json(output, status, headers);
    }

    const licenseId = String(output.licenseId || "");
    const activationId = String(output.activationId || "");
    const validatedAt = String(output.validatedAt || "");
    if (!licenseId || !activationId || !DEVICE_RE.test(parsed.deviceId) || !Number.isFinite(new Date(validatedAt).getTime())) {
      return json(
        { ok: false, code: "LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE" },
        503,
        { "x-minarva-license-backend": "cloudflare-native" },
      );
    }

    const activationCertificate = await signActivationCertificateNatively(
      {
        type: "minarvabiz-activation-v1",
        licenseId,
        activationId,
        deviceId: parsed.deviceId,
        issuedAt: validatedAt,
        expiresAt: output.expiresAt || null,
      },
      authority.privateKey,
    );

    return json(
      { ...output, activationCertificate },
      200,
      {
        "x-minarva-license-backend": "cloudflare-native",
        "x-minarva-license-data": "supabase-rpc",
        "x-minarva-license-authority": "cloudflare-ed25519",
      },
    );
  } catch {
    return json(
      { ok: false, code: "LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE" },
      503,
      {
        "x-minarva-license-backend": "cloudflare-native",
        "x-minarva-license-upstream-stage": "activation-fetch-or-sign",
      },
    );
  }
}

async function validateNatively(request, env, route) {
  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return json(
      { ok: false, code: "UNSUPPORTED_MEDIA_TYPE" },
      415,
      { "x-minarva-license-backend": "cloudflare-native" },
    );
  }

  const body = await readRequestBody(request, route.maxBody);
  if (body?.tooLarge) {
    return json(
      { ok: false, code: "REQUEST_TOO_LARGE" },
      413,
      { "x-minarva-license-backend": "cloudflare-native" },
    );
  }

  const parsed = parseValidationBody(body?.bytes);
  if (!parsed) {
    return json(
      { ok: false, code: "INVALID_REQUEST" },
      400,
      { "x-minarva-license-backend": "cloudflare-native" },
    );
  }

  const apiOrigin = supabaseOrigin(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  const edgeSecret = String(env.LICENSE_EDGE_RPC_SECRET || "").trim();
  if (!apiOrigin || !publishableKey || edgeSecret.length < 32) {
    return json(
      { ok: false, code: "LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE" },
      503,
      { "x-minarva-license-backend": "cloudflare-native" },
    );
  }

  const clientIp = String(request.headers.get("cf-connecting-ip") || "unknown").trim().slice(0, 200) || "unknown";

  try {
    const response = await fetch(`${apiOrigin}/rest/v1/rpc/cloudflare_validate_license`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${publishableKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        p_edge_secret: edgeSecret,
        p_license_token: parsed.licenseToken,
        p_device_id: parsed.deviceId,
        p_client_ip: clientIp,
      }),
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      return json(
        { ok: false, code: "LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE" },
        503,
        {
          "x-minarva-license-backend": "cloudflare-native",
          "x-minarva-license-upstream-status": String(response.status),
          "x-minarva-license-upstream-stage": "supabase-http",
        },
      );
    }

    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return json(
        { ok: false, code: "LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE" },
        503,
        {
          "x-minarva-license-backend": "cloudflare-native",
          "x-minarva-license-upstream-status": String(response.status),
          "x-minarva-license-upstream-stage": "supabase-json",
        },
      );
    }

    const rawStatus = Number(data.httpStatus);
    const status = Number.isInteger(rawStatus) && rawStatus >= 200 && rawStatus <= 599 ? rawStatus : 503;
    const retryAfter = Number(data.retryAfterSeconds);
    const output = { ...data };
    delete output.httpStatus;
    delete output.retryAfterSeconds;

    const headers = {
      "x-minarva-license-backend": "cloudflare-native",
      "x-minarva-license-data": "supabase-rpc",
    };
    if (status === 429 && Number.isFinite(retryAfter) && retryAfter > 0) {
      headers["retry-after"] = String(Math.ceil(retryAfter));
    }
    return json(output, status, headers);
  } catch {
    return json(
      { ok: false, code: "LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE" },
      503,
      {
        "x-minarva-license-backend": "cloudflare-native",
        "x-minarva-license-upstream-stage": "supabase-fetch",
      },
    );
  }
}

async function deactivateNatively(request, env, route) {
  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return json(
      { ok: false, code: "UNSUPPORTED_MEDIA_TYPE" },
      415,
      { "x-minarva-license-backend": "cloudflare-native" },
    );
  }

  const body = await readRequestBody(request, route.maxBody);
  if (body?.tooLarge) {
    return json(
      { ok: false, code: "REQUEST_TOO_LARGE" },
      413,
      { "x-minarva-license-backend": "cloudflare-native" },
    );
  }

  const parsed = parseValidationBody(body?.bytes);
  if (!parsed) {
    return json(
      { ok: false, code: "INVALID_REQUEST" },
      400,
      { "x-minarva-license-backend": "cloudflare-native" },
    );
  }

  const apiOrigin = supabaseOrigin(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  const edgeSecret = String(env.LICENSE_EDGE_RPC_SECRET || "").trim();
  if (!apiOrigin || !publishableKey || edgeSecret.length < 32) {
    return json(
      { ok: false, code: "LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE" },
      503,
      { "x-minarva-license-backend": "cloudflare-native" },
    );
  }

  const clientIp = String(request.headers.get("cf-connecting-ip") || "unknown").trim().slice(0, 200) || "unknown";

  try {
    const response = await fetch(`${apiOrigin}/rest/v1/rpc/cloudflare_deactivate_license`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${publishableKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        p_edge_secret: edgeSecret,
        p_license_token: parsed.licenseToken,
        p_device_id: parsed.deviceId,
        p_client_ip: clientIp,
      }),
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      return json(
        { ok: false, code: "LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE" },
        503,
        {
          "x-minarva-license-backend": "cloudflare-native",
          "x-minarva-license-upstream-status": String(response.status),
          "x-minarva-license-upstream-stage": "supabase-http",
        },
      );
    }

    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return json(
        { ok: false, code: "LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE" },
        503,
        {
          "x-minarva-license-backend": "cloudflare-native",
          "x-minarva-license-upstream-status": String(response.status),
          "x-minarva-license-upstream-stage": "supabase-json",
        },
      );
    }

    const rawStatus = Number(data.httpStatus);
    const status = Number.isInteger(rawStatus) && rawStatus >= 200 && rawStatus <= 599 ? rawStatus : 503;
    const retryAfter = Number(data.retryAfterSeconds);
    const output = { ...data };
    delete output.httpStatus;
    delete output.retryAfterSeconds;

    const headers = {
      "x-minarva-license-backend": "cloudflare-native",
      "x-minarva-license-data": "supabase-rpc",
    };
    if (status === 429 && Number.isFinite(retryAfter) && retryAfter > 0) {
      headers["retry-after"] = String(Math.ceil(retryAfter));
    }
    return json(output, status, headers);
  } catch {
    return json(
      { ok: false, code: "LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE" },
      503,
      {
        "x-minarva-license-backend": "cloudflare-native",
        "x-minarva-license-upstream-stage": "supabase-fetch",
      },
    );
  }
}

async function registerTrialNatively(request, env, route) {
  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return json(
      { ok: false, error: "JSON content type is required." },
      415,
      trialCorsHeaders({ "x-minarva-license-backend": "cloudflare-native" }),
    );
  }

  const body = await readRequestBody(request, route.maxBody);
  if (body?.tooLarge) {
    return json(
      { ok: false, error: "Request is too large." },
      413,
      trialCorsHeaders({ "x-minarva-license-backend": "cloudflare-native" }),
    );
  }

  const parsed = parseTrialBody(body?.bytes);
  if (parsed?.error) {
    return json(
      { ok: false, error: parsed.error },
      400,
      trialCorsHeaders({ "x-minarva-license-backend": "cloudflare-native" }),
    );
  }

  const apiOrigin = supabaseOrigin(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  const edgeSecret = String(env.LICENSE_EDGE_RPC_SECRET || "").trim();
  if (!apiOrigin || !publishableKey || edgeSecret.length < 32) {
    return json(
      { ok: false, error: "Trial registration is temporarily unavailable." },
      503,
      trialCorsHeaders({ "x-minarva-license-backend": "cloudflare-native" }),
    );
  }

  const clientIp = String(request.headers.get("cf-connecting-ip") || "unknown").trim().slice(0, 200) || "unknown";

  try {
    const response = await fetch(`${apiOrigin}/rest/v1/rpc/cloudflare_register_trial`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${publishableKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        p_edge_secret: edgeSecret,
        p_email: parsed.email,
        p_phone: parsed.phone,
        p_organization_name: parsed.organizationName,
        p_address: parsed.address,
        p_device_id: parsed.deviceId,
        p_client_ip: clientIp,
      }),
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      return json(
        { ok: false, error: "Trial registration is temporarily unavailable." },
        503,
        trialCorsHeaders({
          "x-minarva-license-backend": "cloudflare-native",
          "x-minarva-license-upstream-status": String(response.status),
          "x-minarva-license-upstream-stage": "supabase-http",
        }),
      );
    }

    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return json(
        { ok: false, error: "Trial registration is temporarily unavailable." },
        503,
        trialCorsHeaders({
          "x-minarva-license-backend": "cloudflare-native",
          "x-minarva-license-upstream-stage": "supabase-json",
        }),
      );
    }

    const rawStatus = Number(data.httpStatus);
    const status = Number.isInteger(rawStatus) && rawStatus >= 200 && rawStatus <= 599 ? rawStatus : 503;
    const retryAfter = Number(data.retryAfterSeconds);
    const output = { ...data };
    delete output.httpStatus;
    delete output.retryAfterSeconds;

    const headers = trialCorsHeaders({
      "x-minarva-license-backend": "cloudflare-native",
      "x-minarva-license-data": "supabase-rpc",
    });
    if (status === 429 && Number.isFinite(retryAfter) && retryAfter > 0) {
      headers["retry-after"] = String(Math.ceil(retryAfter));
    }
    return json(output, status, headers);
  } catch {
    return json(
      { ok: false, error: "Trial registration is temporarily unavailable." },
      503,
      trialCorsHeaders({
        "x-minarva-license-backend": "cloudflare-native",
        "x-minarva-license-upstream-stage": "supabase-fetch",
      }),
    );
  }
}

async function adminAuthenticatedRpc(request, env, rpcName, rpcBody = {}) {
  const authorization = String(request.headers.get("authorization") || "").trim();
  if (!authorization.startsWith("Bearer ")) {
    return json(
      { ok: false, code: "UNAUTHENTICATED" },
      401,
      { "x-minarva-admin-backend": "cloudflare-native" },
    );
  }

  const accessToken = authorization.slice("Bearer ".length).trim();
  if (accessToken.length < 40 || accessToken.length > 16384 || accessToken.split(".").length !== 3) {
    return json(
      { ok: false, code: "UNAUTHENTICATED" },
      401,
      { "x-minarva-admin-backend": "cloudflare-native" },
    );
  }

  const apiOrigin = supabaseOrigin(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!apiOrigin || !publishableKey) {
    return json(
      { ok: false, code: "ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE" },
      503,
      { "x-minarva-admin-backend": "cloudflare-native" },
    );
  }

  try {
    const response = await fetch(`${apiOrigin}/rest/v1/rpc/${rpcName}`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(rpcBody),
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });

    if (response.status === 401) {
      return json(
        { ok: false, code: "UNAUTHENTICATED" },
        401,
        { "x-minarva-admin-backend": "cloudflare-native" },
      );
    }

    if (!response.ok) {
      return json(
        { ok: false, code: "ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE" },
        503,
        {
          "x-minarva-admin-backend": "cloudflare-native",
          "x-minarva-admin-upstream-status": String(response.status),
        },
      );
    }

    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return json(
        { ok: false, code: "ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE" },
        503,
        { "x-minarva-admin-backend": "cloudflare-native" },
      );
    }

    const rawStatus = Number(data.httpStatus);
    const explicitStatus = Number.isInteger(rawStatus) && rawStatus >= 200 && rawStatus <= 599
      ? rawStatus
      : null;
    const output = { ...data };
    delete output.httpStatus;

    if (output.ok === true) {
      return json(output, explicitStatus || 200, {
        "x-minarva-admin-backend": "cloudflare-native",
        "x-minarva-admin-data": "supabase-authenticated-rpc",
      });
    }

    const code = String(output.code || "ADMIN_FORBIDDEN");
    if (code === "UNAUTHENTICATED") {
      return json(
        { ok: false, code },
        401,
        { "x-minarva-admin-backend": "cloudflare-native" },
      );
    }

    if (
      code === "MFA_REQUIRED" ||
      code === "ADMIN_NOT_ALLOWED" ||
      code === "ADMIN_IDENTITY_MISMATCH" ||
      code === "ADMIN_ROLE_INVALID" ||
      code === "FORBIDDEN"
    ) {
      return json(
        { ok: false, code },
        explicitStatus || 403,
        { "x-minarva-admin-backend": "cloudflare-native" },
      );
    }

    if (
      code === "INVALID_REQUEST" ||
      code === "INVALID_ACTIVATION_LIMIT" ||
      code === "INVALID_FEATURES" ||
      code === "NOT_FOUND" ||
      code === "LICENSE_CONFLICT"
    ) {
      const fallbackStatus = code === "NOT_FOUND" ? 404 : code === "LICENSE_CONFLICT" ? 409 : 400;
      return json(
        { ok: false, code },
        explicitStatus || fallbackStatus,
        { "x-minarva-admin-backend": "cloudflare-native" },
      );
    }

    return json(
      { ok: false, code: "ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE" },
      503,
      { "x-minarva-admin-backend": "cloudflare-native" },
    );
  } catch {
    return json(
      { ok: false, code: "ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE" },
      503,
      {
        "x-minarva-admin-backend": "cloudflare-native",
        "x-minarva-admin-upstream-stage": "supabase-fetch",
      },
    );
  }
}

async function adminBootstrapStatusNatively(request, env) {
  const apiOrigin = supabaseOrigin(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  const edgeSecret = String(env.LICENSE_EDGE_RPC_SECRET || "").trim();
  if (!apiOrigin || !publishableKey || edgeSecret.length < 32) {
    return json({ ok: false, code: "BOOTSTRAP_SERVICE_UNAVAILABLE" }, 503, {
      "x-minarva-admin-backend": "cloudflare-native",
    });
  }

  try {
    const response = await fetch(
      `${apiOrigin}/rest/v1/rpc/cloudflare_admin_bootstrap_status`,
      {
        method: "POST",
        headers: {
          apikey: publishableKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ p_edge_secret: edgeSecret }),
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
      },
    );
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || typeof data !== "object" || Array.isArray(data)) {
      return json({ ok: false, code: "BOOTSTRAP_SERVICE_UNAVAILABLE" }, 503, {
        "x-minarva-admin-backend": "cloudflare-native",
      });
    }

    const output = {
      ok: data.ok === true,
      required: data.required === true,
      configured: Boolean(
        EMAIL_RE.test(String(env.LICENSE_ADMIN_BOOTSTRAP_EMAIL || "").trim().toLowerCase()) &&
        String(env.LICENSE_ADMIN_BOOTSTRAP_NAME || "").trim(),
      ),
    };
    if (!output.ok) {
      return json({ ok: false, code: String(data.code || "BOOTSTRAP_SERVICE_UNAVAILABLE") }, 503, {
        "x-minarva-admin-backend": "cloudflare-native",
      });
    }
    return json(output, 200, {
      "x-minarva-admin-backend": "cloudflare-native",
      "x-minarva-admin-data": "supabase-edge-secret-rpc",
    });
  } catch {
    return json({ ok: false, code: "BOOTSTRAP_SERVICE_UNAVAILABLE" }, 503, {
      "x-minarva-admin-backend": "cloudflare-native",
      "x-minarva-admin-upstream-stage": "bootstrap-status",
    });
  }
}

async function adminBootstrapClaimNatively(request, env) {
  const authorization = String(request.headers.get("authorization") || "").trim();
  if (!authorization.startsWith("Bearer ")) {
    return json({ ok: false, code: "UNAUTHENTICATED" }, 401, {
      "x-minarva-admin-backend": "cloudflare-native",
    });
  }

  const accessToken = authorization.slice("Bearer ".length).trim();
  if (accessToken.length < 40 || accessToken.length > 16384 || accessToken.split(".").length !== 3) {
    return json({ ok: false, code: "UNAUTHENTICATED" }, 401, {
      "x-minarva-admin-backend": "cloudflare-native",
    });
  }

  const apiOrigin = supabaseOrigin(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  const edgeSecret = String(env.LICENSE_EDGE_RPC_SECRET || "").trim();
  const bootstrapEmail = String(env.LICENSE_ADMIN_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
  const displayName = String(env.LICENSE_ADMIN_BOOTSTRAP_NAME || "").trim();
  if (
    !apiOrigin ||
    !publishableKey ||
    edgeSecret.length < 32 ||
    !EMAIL_RE.test(bootstrapEmail) ||
    displayName.length < 1 ||
    displayName.length > 120
  ) {
    return json({ ok: false, code: "BOOTSTRAP_NOT_CONFIGURED" }, 503, {
      "x-minarva-admin-backend": "cloudflare-native",
    });
  }

  try {
    const response = await fetch(
      `${apiOrigin}/rest/v1/rpc/cloudflare_admin_claim_first_admin`,
      {
        method: "POST",
        headers: {
          apikey: publishableKey,
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          p_edge_secret: edgeSecret,
          p_bootstrap_email: bootstrapEmail,
          p_display_name: displayName,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (response.status === 401) {
      return json({ ok: false, code: "UNAUTHENTICATED" }, 401, {
        "x-minarva-admin-backend": "cloudflare-native",
      });
    }
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || typeof data !== "object" || Array.isArray(data)) {
      return json({ ok: false, code: "BOOTSTRAP_SERVICE_UNAVAILABLE" }, 503, {
        "x-minarva-admin-backend": "cloudflare-native",
      });
    }

    const rawStatus = Number(data.httpStatus);
    const explicitStatus = Number.isInteger(rawStatus) && rawStatus >= 200 && rawStatus <= 599
      ? rawStatus
      : null;
    const output = { ...data };
    delete output.httpStatus;

    if (output.ok === true) {
      return json(output, 200, {
        "x-minarva-admin-backend": "cloudflare-native",
        "x-minarva-admin-data": "supabase-authenticated-bootstrap-rpc",
      });
    }

    const code = String(output.code || "BOOTSTRAP_SERVICE_UNAVAILABLE");
    let status = explicitStatus || 503;
    if (code === "UNAUTHENTICATED") status = 401;
    else if (
      code === "MFA_REQUIRED" ||
      code === "BOOTSTRAP_EMAIL_MISMATCH" ||
      code === "BOOTSTRAP_IDENTITY_NOT_VERIFIED"
    ) status = 403;
    else if (
      code === "BOOTSTRAP_CLOSED" ||
      code === "BOOTSTRAP_IDENTITY_IN_USE"
    ) status = 409;

    return json({ ok: false, code }, status, {
      "x-minarva-admin-backend": "cloudflare-native",
    });
  } catch {
    return json({ ok: false, code: "BOOTSTRAP_SERVICE_UNAVAILABLE" }, 503, {
      "x-minarva-admin-backend": "cloudflare-native",
      "x-minarva-admin-upstream-stage": "bootstrap-claim",
    });
  }
}

async function adminMeNatively(request, env) {
  return adminAuthenticatedRpc(request, env, "cloudflare_admin_me");
}

async function adminLicensesNatively(request, env) {
  return adminAuthenticatedRpc(request, env, "cloudflare_admin_list_licenses");
}

function parseAdminLicenseIssueBody(bytes) {
  try {
    const raw = new TextDecoder().decode(bytes || new Uint8Array());
    const body = JSON.parse(raw);
    const customerName =
      typeof body?.customerName === "string" ? body.customerName.trim().slice(0, 201) : "";
    const plan = typeof body?.plan === "string" ? body.plan.trim() : "";
    const edition = typeof body?.edition === "string" ? body.edition.trim() : "";
    if (!customerName || customerName.length > 200 || !LICENSE_PLANS.has(plan) || !LICENSE_EDITIONS.has(edition)) {
      return null;
    }

    let expiresAt = null;
    if (body?.expiresAt != null && String(body.expiresAt).trim()) {
      const date = new Date(String(body.expiresAt).trim());
      if (!Number.isFinite(date.getTime())) return null;
      expiresAt = date.toISOString();
    }

    const maximum = PLAN_MAX_DEVICES[plan];
    let activationLimit = maximum;
    if (body?.activationLimit != null) {
      if (typeof body.activationLimit !== "number" || !Number.isSafeInteger(body.activationLimit)) return null;
      activationLimit = body.activationLimit;
    }
    if (maximum === -1) {
      if (activationLimit !== -1 && activationLimit < 1) return null;
    } else if (activationLimit < 1 || activationLimit > maximum) {
      return null;
    }

    const features = { ...PLAN_FEATURES[plan] };
    const overrides = body?.featureOverrides;
    if (overrides != null) {
      if (typeof overrides !== "object" || Array.isArray(overrides)) return null;
      for (const [key, value] of Object.entries(overrides)) {
        if (!LICENSE_FEATURE_KEYS.includes(key) || typeof value !== "boolean") return null;
        if (value === true && features[key] !== true) return null;
        if (value === false) features[key] = false;
      }
    }

    return { customerName, plan, edition, expiresAt, activationLimit, features };
  } catch {
    return null;
  }
}

async function adminLicenseIssueNatively(request, env, route) {
  const authorization = String(request.headers.get("authorization") || "").trim();
  if (!authorization.startsWith("Bearer ")) {
    return json(
      { ok: false, code: "UNAUTHENTICATED" },
      401,
      { "x-minarva-admin-backend": "cloudflare-native" },
    );
  }

  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return json(
      { ok: false, code: "UNSUPPORTED_MEDIA_TYPE" },
      415,
      { "x-minarva-admin-backend": "cloudflare-native" },
    );
  }

  const body = await readRequestBody(request, route.maxBody);
  if (body?.tooLarge) {
    return json(
      { ok: false, code: "REQUEST_TOO_LARGE" },
      413,
      { "x-minarva-admin-backend": "cloudflare-native" },
    );
  }

  const parsed = parseAdminLicenseIssueBody(body?.bytes);
  if (!parsed) {
    return json(
      { ok: false, code: "INVALID_REQUEST" },
      400,
      { "x-minarva-admin-backend": "cloudflare-native" },
    );
  }

  const authority = signingAuthority(env);
  const edgeSecret = String(env.LICENSE_EDGE_RPC_SECRET || "").trim();
  if (!authority || edgeSecret.length < 32) {
    return json(
      { ok: false, code: "ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE" },
      503,
      { "x-minarva-admin-backend": "cloudflare-native" },
    );
  }

  const issuedAt = new Date().toISOString();
  if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < new Date(issuedAt).getTime()) {
    return json(
      { ok: false, code: "INVALID_REQUEST" },
      400,
      { "x-minarva-admin-backend": "cloudflare-native" },
    );
  }

  const payload = {
    licenseId: randomUUID(),
    customerId: randomUUID(),
    product: "minarvabiz",
    edition: parsed.edition,
    plan: parsed.plan,
    features: parsed.features,
    issuedAt,
    expiresAt: parsed.expiresAt,
    activationLimit: parsed.activationLimit,
    deviceBindings: [],
  };
  const token = await signLicenseTokenNatively(payload, authority.privateKey);
  const tokenSha256 = createHash("sha256").update(token, "utf8").digest("hex");

  return adminAuthenticatedRpc(
    request,
    env,
    "cloudflare_admin_issue_license",
    {
      p_edge_secret: edgeSecret,
      p_license_id: payload.licenseId,
      p_customer_id: payload.customerId,
      p_customer_name: parsed.customerName,
      p_plan: payload.plan,
      p_edition: payload.edition,
      p_expires_at: payload.expiresAt,
      p_activation_limit: payload.activationLimit,
      p_features: payload.features,
      p_token: token,
      p_token_sha256: tokenSha256,
      p_issued_at: payload.issuedAt,
    },
  );
}

function parseAdminOfflineActivationBody(bytes) {
  try {
    const raw = new TextDecoder().decode(bytes || new Uint8Array());
    const body = JSON.parse(raw);
    const licenseId = typeof body?.licenseId === "string" ? body.licenseId.trim().slice(0, 201) : "";
    const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim().toLowerCase().slice(0, 64) : "";
    if (!licenseId || licenseId.length > 200 || !DEVICE_RE.test(deviceId)) return null;
    return { licenseId, deviceId };
  } catch {
    return null;
  }
}

async function adminOfflineActivationNatively(request, env, route) {
  const authorization = String(request.headers.get("authorization") || "").trim();
  if (!authorization.startsWith("Bearer ")) {
    return json({ ok: false, code: "UNAUTHENTICATED" }, 401, {
      "x-minarva-admin-backend": "cloudflare-native",
    });
  }

  const accessToken = authorization.slice("Bearer ".length).trim();
  if (accessToken.length < 40 || accessToken.length > 16384 || accessToken.split(".").length !== 3) {
    return json({ ok: false, code: "UNAUTHENTICATED" }, 401, {
      "x-minarva-admin-backend": "cloudflare-native",
    });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return json({ ok: false, code: "UNSUPPORTED_MEDIA_TYPE" }, 415, {
      "x-minarva-admin-backend": "cloudflare-native",
    });
  }

  const body = await readRequestBody(request, route.maxBody);
  if (body?.tooLarge) {
    return json({ ok: false, code: "REQUEST_TOO_LARGE" }, 413, {
      "x-minarva-admin-backend": "cloudflare-native",
    });
  }

  const parsed = parseAdminOfflineActivationBody(body?.bytes);
  if (!parsed) {
    return json({ ok: false, code: "INVALID_REQUEST" }, 400, {
      "x-minarva-admin-backend": "cloudflare-native",
    });
  }

  const authority = signingAuthority(env);
  const apiOrigin = supabaseOrigin(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!authority || !apiOrigin || !publishableKey) {
    return json({ ok: false, code: "ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE" }, 503, {
      "x-minarva-admin-backend": "cloudflare-native",
    });
  }

  try {
    const response = await fetch(`${apiOrigin}/rest/v1/rpc/cloudflare_admin_prepare_offline_activation`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        p_license_id: parsed.licenseId,
        p_device_id: parsed.deviceId,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });

    if (response.status === 401) {
      return json({ ok: false, code: "UNAUTHENTICATED" }, 401, {
        "x-minarva-admin-backend": "cloudflare-native",
      });
    }
    if (!response.ok) {
      return json({ ok: false, code: "ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE" }, 503, {
        "x-minarva-admin-backend": "cloudflare-native",
        "x-minarva-admin-upstream-status": String(response.status),
      });
    }

    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return json({ ok: false, code: "ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE" }, 503, {
        "x-minarva-admin-backend": "cloudflare-native",
      });
    }

    const rawStatus = Number(data.httpStatus);
    const explicitStatus = Number.isInteger(rawStatus) && rawStatus >= 200 && rawStatus <= 599
      ? rawStatus
      : null;

    if (data.ok !== true) {
      const code = String(data.code || "ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE");
      let fallbackStatus = 503;
      if (code === "UNAUTHENTICATED") fallbackStatus = 401;
      else if (["MFA_REQUIRED","ADMIN_NOT_ALLOWED","ADMIN_IDENTITY_MISMATCH","ADMIN_ROLE_INVALID","FORBIDDEN"].includes(code)) fallbackStatus = 403;
      else if (code === "INVALID_REQUEST") fallbackStatus = 400;
      else if (code === "NOT_FOUND") fallbackStatus = 404;
      else if (["ACTIVATION_LIMIT_REACHED","EXPIRED","LICENSE_NOT_ACTIVE"].includes(code)) fallbackStatus = 409;
      return json({ ok: false, code }, explicitStatus || fallbackStatus, {
        "x-minarva-admin-backend": "cloudflare-native",
      });
    }

    const licenseToken = typeof data.licenseToken === "string" ? data.licenseToken.trim() : "";
    const licenseId = typeof data.licenseId === "string" ? data.licenseId.trim() : "";
    const activationId = typeof data.activationId === "string" ? data.activationId.trim() : "";
    const deviceId = typeof data.deviceId === "string" ? data.deviceId.trim().toLowerCase() : "";
    const issuedAt = typeof data.issuedAt === "string" ? data.issuedAt.trim() : "";
    const expiresAt = data.expiresAt == null ? null : String(data.expiresAt).trim();

    if (!licenseToken || licenseToken.length > 2000 || !licenseId || !activationId || !DEVICE_RE.test(deviceId) ||
        !Number.isFinite(new Date(issuedAt).getTime()) ||
        (expiresAt !== null && !Number.isFinite(new Date(expiresAt).getTime()))) {
      return json({ ok: false, code: "ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE" }, 503, {
        "x-minarva-admin-backend": "cloudflare-native",
      });
    }

    const activationCertificate = await signActivationCertificateNatively({
      type: "minarvabiz-activation-v1",
      licenseId,
      activationId,
      deviceId,
      issuedAt,
      expiresAt,
    }, authority.privateKey);

    const packageData = {
      format: "minarvabiz-license-v1",
      product: "minarvabiz",
      licenseToken,
      activationCertificate,
      licenseId,
      activationId,
      deviceId,
      issuedAt,
      expiresAt,
    };
    const safeLicenseId = licenseId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "license";

    return json({
      ok: true,
      filename: `MinarvaBiz-${safeLicenseId}-${deviceId.slice(0, 8)}.lic`,
      content: JSON.stringify(packageData, null, 2),
      activationId,
    }, 200, {
      "x-minarva-admin-backend": "cloudflare-native",
      "x-minarva-admin-data": "supabase-authenticated-rpc",
      "x-minarva-license-authority": authority.publicKeyHex,
    });
  } catch {
    return json({ ok: false, code: "ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE" }, 503, {
      "x-minarva-admin-backend": "cloudflare-native",
      "x-minarva-admin-upstream-stage": "offline-activation",
    });
  }
}

function parseAdminLicenseStatusBody(bytes) {
  try {
    const raw = new TextDecoder().decode(bytes || new Uint8Array());
    const body = JSON.parse(raw);
    const licenseId = typeof body?.licenseId === "string" ? body.licenseId.trim().slice(0, 201) : "";
    const status = typeof body?.status === "string" ? body.status.trim() : "";
    if (!licenseId || licenseId.length > 200 || !LICENSE_STATUS_ACTIONS.has(status)) return null;
    return { p_license_id: licenseId, p_status: status };
  } catch {
    return null;
  }
}

async function adminLicenseStatusNatively(request, env, route) {
  const authorization = String(request.headers.get("authorization") || "").trim();
  if (!authorization.startsWith("Bearer ")) {
    return json(
      { ok: false, code: "UNAUTHENTICATED" },
      401,
      { "x-minarva-admin-backend": "cloudflare-native" },
    );
  }

  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return json(
      { ok: false, code: "UNSUPPORTED_MEDIA_TYPE" },
      415,
      { "x-minarva-admin-backend": "cloudflare-native" },
    );
  }

  const body = await readRequestBody(request, route.maxBody);
  if (body?.tooLarge) {
    return json(
      { ok: false, code: "REQUEST_TOO_LARGE" },
      413,
      { "x-minarva-admin-backend": "cloudflare-native" },
    );
  }

  const parsed = parseAdminLicenseStatusBody(body?.bytes);
  if (!parsed) {
    return json(
      { ok: false, code: "INVALID_REQUEST" },
      400,
      { "x-minarva-admin-backend": "cloudflare-native" },
    );
  }

  return adminAuthenticatedRpc(
    request,
    env,
    "cloudflare_admin_set_license_status",
    parsed,
  );
}

function parseAdminCustomerProvisionBody(bytes) {
  try {
    const raw = new TextDecoder().decode(bytes || new Uint8Array());
    const body = JSON.parse(raw);
    const shopName =
      typeof body?.shopName === "string" ? body.shopName.trim().slice(0, 201) : "";
    const adminName =
      typeof body?.adminName === "string" ? body.adminName.trim().slice(0, 201) : "";
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 255) : "";

    if (!shopName || shopName.length > 200) return null;
    if (!adminName || adminName.length > 200) return null;
    if (!EMAIL_RE.test(email) || email.length > 254) return null;

    return { shopName, adminName, email };
  } catch {
    return null;
  }
}

function onlineAppOrigin(env) {
  return allowedOrigin(env.MINARVA_ONLINE_APP_URL || DEFAULT_ONLINE_APP_URL);
}

async function fetchAdminProvisionRpc(apiOrigin, publishableKey, accessToken, rpcName, rpcBody) {
  const response = await fetch(`${apiOrigin}/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(rpcBody),
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });

  const data = await response.json().catch(() => null);
  return { response, data };
}

function adminProvisionStatus(data, fallback = 503) {
  const explicit = Number(data?.httpStatus);
  if (Number.isInteger(explicit) && explicit >= 200 && explicit <= 599) return explicit;
  const code = String(data?.code || "");
  if (code === "UNAUTHENTICATED") return 401;
  if (["MFA_REQUIRED","ADMIN_NOT_ALLOWED","ADMIN_IDENTITY_MISMATCH","ADMIN_ROLE_INVALID","FORBIDDEN"].includes(code)) return 403;
  if (code === "INVALID_REQUEST") return 400;
  if (["CUSTOMER_ALREADY_EXISTS","CUSTOMER_REVIEW_REQUIRED","PROVISION_VERIFY_FAILED"].includes(code)) return 409;
  if (code === "PROVISION_EMAIL_FAILED") return 502;
  return fallback;
}

async function adminCustomerProvisionNatively(request, env, route) {
  const authorization = String(request.headers.get("authorization") || "").trim();
  if (!authorization.startsWith("Bearer ")) {
    return json({ ok: false, code: "UNAUTHENTICATED" }, 401, {
      "x-minarva-admin-backend": "cloudflare-native",
    });
  }

  const accessToken = authorization.slice("Bearer ".length).trim();
  if (accessToken.length < 40 || accessToken.length > 16384 || accessToken.split(".").length !== 3) {
    return json({ ok: false, code: "UNAUTHENTICATED" }, 401, {
      "x-minarva-admin-backend": "cloudflare-native",
    });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return json({ ok: false, code: "UNSUPPORTED_MEDIA_TYPE" }, 415, {
      "x-minarva-admin-backend": "cloudflare-native",
    });
  }

  const body = await readRequestBody(request, route.maxBody);
  if (body?.tooLarge) {
    return json({ ok: false, code: "REQUEST_TOO_LARGE" }, 413, {
      "x-minarva-admin-backend": "cloudflare-native",
    });
  }

  const parsed = parseAdminCustomerProvisionBody(body?.bytes);
  if (!parsed) {
    return json({ ok: false, code: "INVALID_REQUEST" }, 400, {
      "x-minarva-admin-backend": "cloudflare-native",
    });
  }

  const apiOrigin = supabaseOrigin(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  const onlineOrigin = onlineAppOrigin(env);
  if (!apiOrigin || !publishableKey || !onlineOrigin) {
    return json({ ok: false, code: "ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE" }, 503, {
      "x-minarva-admin-backend": "cloudflare-native",
    });
  }

  const redirectTo = `${onlineOrigin}/reset-password`;

  try {
    const preflight = await fetchAdminProvisionRpc(
      apiOrigin,
      publishableKey,
      accessToken,
      "cloudflare_admin_preflight_customer_provision",
      {
        p_email: parsed.email,
        p_shop_name: parsed.shopName,
        p_admin_name: parsed.adminName,
      },
    );

    if (preflight.response.status === 401) {
      return json({ ok: false, code: "UNAUTHENTICATED" }, 401, {
        "x-minarva-admin-backend": "cloudflare-native",
      });
    }
    if (!preflight.response.ok || !preflight.data || typeof preflight.data !== "object" || Array.isArray(preflight.data)) {
      return json({ ok: false, code: "ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE" }, 503, {
        "x-minarva-admin-backend": "cloudflare-native",
      });
    }
    if (preflight.data.ok !== true) {
      const output = { ...preflight.data };
      delete output.httpStatus;
      return json(output, adminProvisionStatus(preflight.data), {
        "x-minarva-admin-backend": "cloudflare-native",
        "x-minarva-admin-data": "supabase-authenticated-rpc",
      });
    }

    const authResponse = await fetch(
      `${apiOrigin}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`,
      {
        method: "POST",
        headers: {
          apikey: publishableKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          email: parsed.email,
          data: {
            full_name: parsed.adminName,
            shop_name: parsed.shopName,
          },
          create_user: true,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      },
    );

    let upstreamError = null;
    if (!authResponse.ok) {
      const authData = await authResponse.json().catch(() => null);
      upstreamError = String(
        authData?.msg ||
        authData?.message ||
        authData?.error_description ||
        authData?.error ||
        `Supabase Magic Link request failed (${authResponse.status})`,
      ).slice(0, 500);
    }

    const finalized = await fetchAdminProvisionRpc(
      apiOrigin,
      publishableKey,
      accessToken,
      "cloudflare_admin_finalize_customer_provision",
      {
        p_email: parsed.email,
        p_shop_name: parsed.shopName,
        p_admin_name: parsed.adminName,
        p_redirect_to: redirectTo,
        p_upstream_error: upstreamError,
      },
    );

    if (finalized.response.status === 401) {
      return json({ ok: false, code: "UNAUTHENTICATED" }, 401, {
        "x-minarva-admin-backend": "cloudflare-native",
      });
    }
    if (!finalized.response.ok || !finalized.data || typeof finalized.data !== "object" || Array.isArray(finalized.data)) {
      return json({ ok: false, code: "ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE" }, 503, {
        "x-minarva-admin-backend": "cloudflare-native",
      });
    }

    const output = { ...finalized.data };
    delete output.httpStatus;
    return json(output, adminProvisionStatus(finalized.data, output.ok === true ? 200 : 503), {
      "x-minarva-admin-backend": "cloudflare-native",
      "x-minarva-admin-data": "supabase-authenticated-rpc",
      "x-minarva-customer-provisioning": "supabase-magic-link",
    });
  } catch {
    return json({ ok: false, code: "ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE" }, 503, {
      "x-minarva-admin-backend": "cloudflare-native",
      "x-minarva-admin-upstream-stage": "customer-provision",
    });
  }
}

async function adminSupportNatively(request, env) {
  return adminAuthenticatedRpc(request, env, "cloudflare_admin_list_support_requests");
}

function parseAdminSupportUpdateBody(bytes) {
  try {
    const raw = new TextDecoder().decode(bytes || new Uint8Array());
    const body = JSON.parse(raw);
    const id = typeof body?.id === "string" ? body.id.trim().toLowerCase() : "";
    const status = typeof body?.status === "string" ? body.status.trim() : "";
    const assignedTo =
      typeof body?.assignedTo === "string" ? body.assignedTo.trim().slice(0, 321) : "";
    const adminNotes =
      typeof body?.adminNotes === "string" ? body.adminNotes.trim().slice(0, 12001) : "";

    if (!UUID_RE.test(id) || !SUPPORT_REQUEST_STATUSES.has(status)) return null;
    if (assignedTo.length > 320 || adminNotes.length > 12000) return null;

    return {
      p_id: id,
      p_status: status,
      p_assigned_to: assignedTo || null,
      p_admin_notes: adminNotes || null,
    };
  } catch {
    return null;
  }
}

async function adminSupportUpdateNatively(request, env, route) {
  const authorization = String(request.headers.get("authorization") || "").trim();
  if (!authorization.startsWith("Bearer ")) {
    return json(
      { ok: false, code: "UNAUTHENTICATED" },
      401,
      { "x-minarva-admin-backend": "cloudflare-native" },
    );
  }

  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return json(
      { ok: false, code: "UNSUPPORTED_MEDIA_TYPE" },
      415,
      { "x-minarva-admin-backend": "cloudflare-native" },
    );
  }

  const body = await readRequestBody(request, route.maxBody);
  if (body?.tooLarge) {
    return json(
      { ok: false, code: "REQUEST_TOO_LARGE" },
      413,
      { "x-minarva-admin-backend": "cloudflare-native" },
    );
  }

  const parsed = parseAdminSupportUpdateBody(body?.bytes);
  if (!parsed) {
    return json(
      { ok: false, code: "INVALID_REQUEST" },
      400,
      { "x-minarva-admin-backend": "cloudflare-native" },
    );
  }

  return adminAuthenticatedRpc(
    request,
    env,
    "cloudflare_admin_update_support_request",
    parsed,
  );
}

async function updateManifestNatively(authority) {
  if (!authority) {
    return json({ error: "Update manifest service is unavailable.", stage: "authority" }, 503);
  }

  try {
    const latest = await fetch(GITHUB_LATEST_RELEASE, {
      headers: { "user-agent": "MinarvaBiz-License-Edge" },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    const location = String(latest.headers.get("location") || "");
    const match = location.match(/\/releases\/tag\/v(\d+\.\d+\.\d+)(?:$|[?#])/);
    const version = match?.[1] || "";
    if (!version) {
      return json(
        { error: "Stable release version is unavailable.", stage: "latest-release", status: latest.status },
        503,
      );
    }

    const installerName = `MinarvaBiz-Setup-${version}.exe`;
    const checksumUrl = `${GITHUB_RELEASE_DOWNLOAD_BASE}/v${version}/${installerName}.sha256`;
    const checksumResponse = await fetch(checksumUrl, {
      headers: {
        accept: "text/plain",
        "user-agent": "MinarvaBiz-License-Edge",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!checksumResponse.ok) {
      return json(
        { error: "Stable installer checksum is unavailable.", stage: "checksum", status: checksumResponse.status },
        503,
      );
    }

    const checksumText = (await checksumResponse.text()).trim();
    const checksumMatch = checksumText.match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    const sha256 = String(checksumMatch?.[1] || "").toLowerCase();
    const declaredName = String(checksumMatch?.[2] || "").trim();
    if (!/^[0-9a-f]{64}$/.test(sha256) || declaredName !== installerName) {
      return json({ error: "Stable installer checksum is malformed.", stage: "checksum-parse" }, 503);
    }

    const installerUrl = `${GITHUB_RELEASE_DOWNLOAD_BASE}/v${version}/${installerName}`;
    const timestampHeader =
      checksumResponse.headers.get("last-modified") ||
      checksumResponse.headers.get("date") ||
      "";
    const timestamp = new Date(timestampHeader);
    const publishedAt = Number.isFinite(timestamp.getTime())
      ? timestamp.toISOString()
      : new Date().toISOString();

    const unsigned = {
      product: "minarvabiz",
      version,
      installerUrl,
      sha256,
      publishedAt,
    };
    const signature = nodeSign(
      null,
      Buffer.from(canonicalUpdateManifest(unsigned), "utf8"),
      authority.privateKey,
    ).toString("base64url");

    return json(
      {
        ...unsigned,
        notes: `Minarva Biz ${version}`,
        signature,
      },
      200,
      {
        "x-minarva-license-backend": "cloudflare-native",
        "x-minarva-update-source": "github-release",
      },
    );
  } catch {
    return json({ error: "Update manifest service is unavailable.", stage: "fetch-or-sign" }, 503);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/edge/health") {
      const authority = signingAuthority(env);
      const validationRpcConfigured = Boolean(
        supabaseOrigin(env.SUPABASE_URL || DEFAULT_SUPABASE_URL) &&
        String(env.SUPABASE_PUBLISHABLE_KEY || "").trim() &&
        String(env.LICENSE_EDGE_RPC_SECRET || "").trim().length >= 32,
      );
      return json({
        ok: true,
        service: "minarva-license-edge",
        provider: "cloudflare-workers",
        validationRpcConfigured,
        deactivationRpcConfigured: validationRpcConfigured,
        trialRpcConfigured: validationRpcConfigured,
        activationSigningConfigured: Boolean(authority),
        updateSigningConfigured: Boolean(authority),
        adminAuthConfigured: Boolean(
          supabaseOrigin(env.SUPABASE_URL || DEFAULT_SUPABASE_URL) &&
          String(env.SUPABASE_PUBLISHABLE_KEY || "").trim(),
        ),
        customerProvisioningConfigured: Boolean(
          supabaseOrigin(env.SUPABASE_URL || DEFAULT_SUPABASE_URL) &&
          String(env.SUPABASE_PUBLISHABLE_KEY || "").trim() &&
          onlineAppOrigin(env),
        ),
        renderDependency: false,
        paidDependencyIntroduced: false,
      });
    }

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/admin/")) {
      return adminPreflight(request, env);
    }

    const route = ALLOWED_ROUTES.get(`${request.method} ${url.pathname}`);
    if (!route) return json({ ok: false, code: "NOT_FOUND" }, 404);

    if (request.method === "OPTIONS" && url.pathname === "/api/trial/register") {
      return new Response(null, {
        status: 204,
        headers: trialCorsHeaders({
          "x-minarva-license-edge": "cloudflare",
          "x-minarva-license-backend": "cloudflare-native",
        }),
      });
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      const authority = signingAuthority(env);
      return json(
        {
          status: "ok",
          service: "minarva-license-edge",
          provider: "cloudflare-workers",
          updateChannel: "github-release-signed-at-cloudflare",
          validationBackend: "cloudflare-native-supabase-rpc",
          deactivationBackend: "cloudflare-native-supabase-rpc",
          trialBackend: "cloudflare-native-supabase-rpc",
          activationBackend: authority ? "cloudflare-native-supabase-rpc" : "unavailable",
          mutationBackend: authority ? "cloudflare-native" : "unavailable",
          adminAuthBackend: "cloudflare-native-supabase-jwt",
          customerProvisioningBackend: "cloudflare-native-supabase-magic-link",
          renderDependency: false,
          paidDependencyIntroduced: false,
        },
        200,
        { "x-minarva-license-backend": "cloudflare-native" },
      );
    }

    if (request.method === "GET" && url.pathname === "/api/public-key") {
      const authority = signingAuthority(env);
      if (!authority) return json({ error: "Public key service is unavailable." }, 503);
      return json(
        { publicKeyHex: authority.publicKeyHex },
        200,
        {
          "cache-control": "public, max-age=3600",
          "x-minarva-license-backend": "cloudflare-native",
        },
      );
    }

    if (route.nativeUpdateManifest) {
      return updateManifestNatively(signingAuthority(env));
    }

    if (route.nativeAdminAuthConfig) {
      const apiOrigin = supabaseOrigin(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
      const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
      if (!apiOrigin || !publishableKey) {
        return json({ ok: false, code: "ADMIN_AUTH_NOT_CONFIGURED" }, 503, {
          "x-minarva-admin-backend": "cloudflare-native",
        });
      }
      return withAdminCors(
        json(
          {
            ok: true,
            supabaseUrl: apiOrigin,
            supabasePublishableKey: publishableKey,
          },
          200,
          {
            "cache-control": "public, max-age=300",
            "x-minarva-admin-backend": "cloudflare-native",
          },
        ),
        request,
        env,
      );
    }

    if (route.nativeAdminBootstrapStatus) {
      return withAdminCors(await adminBootstrapStatusNatively(request, env), request, env);
    }

    if (route.nativeAdminBootstrapClaim) {
      return withAdminCors(await adminBootstrapClaimNatively(request, env), request, env);
    }

    if (route.nativeAdminMe) {
      return withAdminCors(await adminMeNatively(request, env), request, env);
    }

    if (route.nativeAdminLicenses) {
      return withAdminCors(await adminLicensesNatively(request, env), request, env);
    }

    if (route.nativeAdminLicenseIssue) {
      return withAdminCors(await adminLicenseIssueNatively(request, env, route), request, env);
    }

    if (route.nativeAdminOfflineActivation) {
      return withAdminCors(await adminOfflineActivationNatively(request, env, route), request, env);
    }

    if (route.nativeAdminLicenseStatus) {
      return withAdminCors(await adminLicenseStatusNatively(request, env, route), request, env);
    }

    if (route.nativeAdminSupport) {
      return withAdminCors(await adminSupportNatively(request, env), request, env);
    }

    if (route.nativeAdminSupportUpdate) {
      return withAdminCors(await adminSupportUpdateNatively(request, env, route), request, env);
    }

    if (route.nativeAdminCustomerProvision) {
      return withAdminCors(await adminCustomerProvisionNatively(request, env, route), request, env);
    }

    if (route.nativeActivate) {
      const authority = signingAuthority(env);
      if (!authority) {
        return json(
          { ok: false, code: "LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE" },
          503,
          { "x-minarva-license-backend": "cloudflare-native" },
        );
      }
      return activateNatively(request, env, route, authority);
    }

    if (route.nativeValidate) {
      return validateNatively(request, env, route);
    }

    if (route.nativeDeactivate) {
      return deactivateNatively(request, env, route);
    }

    if (route.nativeTrial) {
      return registerTrialNatively(request, env, route);
    }

    return json({ ok: false, code: "NOT_FOUND" }, 404);
  },
};
