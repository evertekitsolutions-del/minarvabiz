const ALLOWED_ROUTES = new Map([
  ["GET /api/health", { maxBody: 0 }],
  ["GET /api/public-key", { maxBody: 0 }],
  ["GET /api/update/manifest", { maxBody: 0, updateFallback: true }],
  ["POST /api/license/activate", { maxBody: 64 * 1024 }],
  ["POST /api/license/validate", { maxBody: 64 * 1024 }],
  ["POST /api/license/deactivate", { maxBody: 64 * 1024 }],
  ["POST /api/trial/register", { maxBody: 64 * 1024 }],
  ["OPTIONS /api/trial/register", { maxBody: 0 }],
]);

const DEFAULT_ORIGIN = "https://minarvabiz-license-admin.onrender.com";
const DEFAULT_UPDATE_FALLBACK =
  "https://github.com/evertekitsolutions-del/minarvabiz/releases/latest/download/MinarvaBiz-update-manifest.json";
const LICENSE_PUBLIC_KEY_HEX = "2e1e4a5136c118603da5618d21017adf9c8a699e44856efa3aa127ebe090e6b4";

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
      return json({
        ok: true,
        service: "minarva-license-edge",
        provider: "cloudflare-workers",
        originConfigured: Boolean(origin),
        paidDependencyIntroduced: false,
      });
    }

    const route = ALLOWED_ROUTES.get(`${request.method} ${url.pathname}`);
    if (!route) return json({ ok: false, code: "NOT_FOUND" }, 404);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json(
        {
          status: "ok",
          service: "minarva-license-edge",
          provider: "cloudflare-workers",
          updateChannel: "github-release",
          licenseBackend: "origin-transition",
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

    const proxied = await fetchOrigin(request, env, route);
    if (proxied) return proxied;

    return json({ ok: false, code: "LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE" }, 503);
  },
};
