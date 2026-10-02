const ALLOWED_ROUTES = new Map([
  ["GET /api/health", { maxBody: 0 }],
  ["GET /api/public-key", { maxBody: 0 }],
  ["GET /api/update/manifest", { maxBody: 0, updateFallback: true }],
  ["POST /api/license/activate", { maxBody: 64 * 1024 }],
  ["POST /api/license/validate", { maxBody: 16 * 1024, nativeValidate: true }],
  ["POST /api/license/deactivate", { maxBody: 16 * 1024, nativeDeactivate: true }],
  ["POST /api/trial/register", { maxBody: 16 * 1024, nativeTrial: true }],
  ["OPTIONS /api/trial/register", { maxBody: 0 }],
]);

const DEFAULT_ORIGIN = "https://minarvabiz-license-admin.onrender.com";
const DEFAULT_SUPABASE_URL = "https://wmjgefbaliuwmaxyzxkq.supabase.co";
const DEFAULT_UPDATE_FALLBACK =
  "https://github.com/evertekitsolutions-del/minarvabiz/releases/latest/download/MinarvaBiz-update-manifest.json";
const LICENSE_PUBLIC_KEY_HEX = "2e1e4a5136c118603da5618d21017adf9c8a699e44856efa3aa127ebe090e6b4";
const DEVICE_RE = /^[a-f0-9]{64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{6,50}$/;

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

function copyResponseHeaders(source) {
  const headers = new Headers();
  for (const name of [
    "content-type",
    "cache-control",
    "retry-after",
    "access-control-allow-origin",
    "access-control-allow-methods",
    "access-control-allow-headers",
    "access-control-max-age",
  ]) {
    const value = source.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-minarva-license-edge", "cloudflare");
  headers.set("x-minarva-license-backend", "origin-transition");
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return headers;
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

async function fetchOrigin(request, env, route) {
  const origin = allowedOrigin(env.LICENSE_ORIGIN || DEFAULT_ORIGIN);
  if (!origin) return json({ ok: false, code: "EDGE_ORIGIN_NOT_CONFIGURED" }, 503);

  const body = await readRequestBody(request, route.maxBody);
  if (body?.tooLarge) return json({ ok: false, code: "REQUEST_TOO_LARGE" }, 413);

  const sourceUrl = new URL(request.url);
  const target = new URL(sourceUrl.pathname + sourceUrl.search, origin);
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const accept = request.headers.get("accept");
  if (contentType) headers.set("content-type", contentType);
  if (accept) headers.set("accept", accept);
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) headers.set("cf-connecting-ip", cfIp);
  headers.set("x-minarva-edge", "cloudflare-license-edge");

  try {
    const response = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: body?.bytes || undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(request.method === "GET" ? 20_000 : 70_000),
    });

    if (route.updateFallback && !response.ok) {
      return null;
    }

    return new Response(response.body, {
      status: response.status,
      headers: copyResponseHeaders(response),
    });
  } catch {
    return null;
  }
}

async function updateFallback(env) {
  const fallbackUrl = String(env.UPDATE_MANIFEST_FALLBACK || DEFAULT_UPDATE_FALLBACK).trim();
  let parsed;
  try {
    parsed = new URL(fallbackUrl);
  } catch {
    return json({ error: "Update manifest service is unavailable." }, 503);
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
    return json({ error: "Update manifest service is unavailable." }, 503);
  }

  try {
    const response = await fetch(parsed.toString(), {
      headers: {
        accept: "application/json",
        "user-agent": "MinarvaBiz-License-Edge",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return json({ error: "Update manifest service is unavailable." }, 503);
    const headers = copyResponseHeaders(response);
    headers.set("cache-control", "no-store");
    headers.set("x-minarva-license-backend", "github-release");
    headers.set("x-minarva-update-source", "github-release");
    return new Response(response.body, { status: 200, headers });
  } catch {
    return json({ error: "Update manifest service is unavailable." }, 503);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/edge/health") {
      const origin = allowedOrigin(env.LICENSE_ORIGIN || DEFAULT_ORIGIN);
      const validationRpcConfigured = Boolean(
        supabaseOrigin(env.SUPABASE_URL || DEFAULT_SUPABASE_URL) &&
        String(env.SUPABASE_PUBLISHABLE_KEY || "").trim() &&
        String(env.LICENSE_EDGE_RPC_SECRET || "").trim().length >= 32,
      );
      return json({
        ok: true,
        service: "minarva-license-edge",
        provider: "cloudflare-workers",
        originConfigured: Boolean(origin),
        validationRpcConfigured,
        deactivationRpcConfigured: validationRpcConfigured,
        trialRpcConfigured: validationRpcConfigured,
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
      return json(
        {
          status: "ok",
          service: "minarva-license-edge",
          provider: "cloudflare-workers",
          updateChannel: "github-release",
          validationBackend: "cloudflare-native-supabase-rpc",
          deactivationBackend: "cloudflare-native-supabase-rpc",
          trialBackend: "cloudflare-native-supabase-rpc",
          mutationBackend: "origin-transition",
          paidDependencyIntroduced: false,
        },
        200,
        { "x-minarva-license-backend": "cloudflare-native" },
      );
    }

    if (request.method === "GET" && url.pathname === "/api/public-key") {
      return json(
        { publicKeyHex: LICENSE_PUBLIC_KEY_HEX },
        200,
        {
          "cache-control": "public, max-age=3600",
          "x-minarva-license-backend": "cloudflare-native",
        },
      );
    }

    if (route.updateFallback) {
      return updateFallback(env);
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

    const proxied = await fetchOrigin(request, env, route);
    if (proxied) return proxied;

    return json({ ok: false, code: "LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE" }, 503);
  },
};
