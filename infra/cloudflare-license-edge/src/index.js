import { Buffer } from "node:buffer";
import { createHash, createPrivateKey, createPublicKey, sign as nodeSign, verify as nodeVerify } from "node:crypto";

const ALLOWED_ROUTES = new Map([
  ["GET /api/health", { maxBody: 0 }],
  ["GET /api/public-key", { maxBody: 0 }],
  ["GET /api/update/manifest", { maxBody: 0, nativeUpdateManifest: true }],
  ["POST /api/license/activate", { maxBody: 16 * 1024, nativeActivate: true }],
  ["POST /api/license/validate", { maxBody: 16 * 1024, nativeValidate: true }],
  ["POST /api/license/deactivate", { maxBody: 16 * 1024, nativeDeactivate: true }],
  ["POST /api/trial/register", { maxBody: 16 * 1024, nativeTrial: true }],
  ["OPTIONS /api/trial/register", { maxBody: 0 }],
]);

const DEFAULT_SUPABASE_URL = "https://wmjgefbaliuwmaxyzxkq.supabase.co";
const GITHUB_LATEST_RELEASE =
  "https://github.com/evertekitsolutions-del/minarvabiz/releases/latest";
const GITHUB_RELEASE_DOWNLOAD_BASE =
  "https://github.com/evertekitsolutions-del/minarvabiz/releases/download";
const SIGNING_KDF_DOMAIN = "minarvabiz-ed25519-authority-v1\0";
const DEVICE_RE = /^[a-f0-9]{64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{6,50}$/;

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
        renderDependency: false,
        paidDependencyIntroduced: false,
      });
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
