const TEAM_SLUG = "minarva-biz";
const TEAM_ID = "team_I74uWi3aeWhymbb4apEZ3nnq";
const PROJECT_NAME = "minarvabiz";
const PROJECT_ID = "prj_GgZIaN5Q1SqS5oU5Ax89z4itcust";
const EXPECTED_SUBJECT = `owner:${TEAM_SLUG}:project:${PROJECT_NAME}:environment:production`;
const EXPECTED_AUDIENCE = `https://vercel.com/${TEAM_SLUG}`;
const ALLOWED_ISSUERS = new Set([
  "https://oidc.vercel.com",
  `https://oidc.vercel.com/${TEAM_SLUG}`,
]);

const TEXT_MODEL = "@cf/zai-org/glm-4.7-flash";
const VISION_MODEL = "@cf/google/gemma-4-26b-a4b-it";
const MAX_BODY_BYTES = 3_000_000;
const MAX_INSTRUCTIONS = 24_000;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_IMAGE_CHARS = 2_600_000;
const MAX_OUTPUT_TOKENS = 1_600;

let jwksCache = new Map();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  return bytes;
}

function parseJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

function audMatches(value) {
  if (typeof value === "string") return value === EXPECTED_AUDIENCE;
  return Array.isArray(value) && value.includes(EXPECTED_AUDIENCE);
}

async function getJwk(issuer, kid) {
  const cacheKey = `${issuer}|${kid}`;
  const cached = jwksCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.jwk;

  const response = await fetch(`${issuer}/.well-known/jwks`, {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!response.ok) throw new Error("Unable to load Vercel OIDC signing keys.");
  const payload = await response.json();
  const keys = Array.isArray(payload?.keys) ? payload.keys : [];
  const jwk = keys.find((item) => item?.kid === kid);
  if (!jwk) throw new Error("Vercel OIDC signing key was not found.");

  jwksCache.set(cacheKey, { jwk, expiresAt: Date.now() + 5 * 60_000 });
  return jwk;
}

async function verifyOidcToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid OIDC token.");

  const header = parseJwtPart(parts[0]);
  const payload = parseJwtPart(parts[1]);
  if (header?.alg !== "RS256" || typeof header?.kid !== "string") {
    throw new Error("Unsupported OIDC signing algorithm.");
  }

  const issuer = clean(payload?.iss, 300);
  if (!ALLOWED_ISSUERS.has(issuer)) throw new Error("OIDC issuer mismatch.");
  if (!audMatches(payload?.aud)) throw new Error("OIDC audience mismatch.");
  if (payload?.sub !== EXPECTED_SUBJECT) throw new Error("OIDC subject mismatch.");
  if (
    payload?.owner_id !== TEAM_ID ||
    payload?.project_id !== PROJECT_ID ||
    payload?.project !== PROJECT_NAME ||
    payload?.environment !== "production"
  ) {
    throw new Error("OIDC project identity mismatch.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(payload?.exp) || payload.exp <= now) throw new Error("OIDC token expired.");
  if (Number.isFinite(payload?.nbf) && payload.nbf > now + 60) throw new Error("OIDC token is not active.");
  if (Number.isFinite(payload?.iat) && payload.iat > now + 60) throw new Error("OIDC token issued in the future.");

  const jwk = await getJwk(issuer, header.kid);
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = decodeBase64Url(parts[2]);
  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    publicKey,
    signature,
    signingInput,
  );
  if (!valid) throw new Error("OIDC signature verification failed.");
  return payload;
}

function imageDataUrl(value) {
  if (typeof value !== "string" || value.length > MAX_IMAGE_CHARS) return null;
  return /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value) ? value : null;
}

function extractText(result) {
  if (typeof result === "string") return result.trim();
  if (typeof result?.response === "string") return result.response.trim();
  const choice = Array.isArray(result?.choices) ? result.choices[0] : null;
  if (typeof choice?.message?.content === "string") return choice.message.content.trim();
  if (typeof result?.result?.response === "string") return result.result.response.trim();
  return "";
}

function classifyWorkerAiError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (/3040|out of capacity|quota|neuron|daily limit|rate limit/.test(lower)) {
    return { code: "free_quota_exhausted", status: 429 };
  }
  if (/5035|paid plan|upgrade/.test(lower)) {
    return { code: "free_plan_restricted", status: 403 };
  }
  if (/model|not found|unsupported/.test(lower)) {
    return { code: "model_unavailable", status: 503 };
  }
  return { code: "provider_unavailable", status: 503 };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "minarva-free-ai",
        provider: "cloudflare-workers-ai",
        textModel: TEXT_MODEL,
        visionModel: VISION_MODEL,
        paidFallback: false,
      });
    }

    if (request.method !== "POST" || url.pathname !== "/v1/respond") {
      return json({ ok: false, error: "Not found." }, 404);
    }

    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > MAX_BODY_BYTES) {
      return json({ ok: false, error: "AI request is too large." }, 413);
    }

    const auth = request.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    try {
      await verifyOidcToken(token);
    } catch {
      return json({ ok: false, error: "Unauthorized AI request." }, 401);
    }

    let body;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
        return json({ ok: false, error: "AI request is too large." }, 413);
      }
      body = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "Invalid JSON request." }, 400);
    }

    const instructions = clean(body?.instructions, MAX_INSTRUCTIONS);
    const messages = (Array.isArray(body?.messages) ? body.messages : [])
      .slice(-MAX_MESSAGES)
      .map((item) => ({
        role: item?.role === "assistant" ? "assistant" : "user",
        content: clean(item?.content, MAX_MESSAGE_CHARS),
      }))
      .filter((item) => item.content);
    if (!instructions || !messages.length) {
      return json({ ok: false, error: "AI instructions and messages are required." }, 400);
    }

    const image = imageDataUrl(body?.image);
    const maxTokens = Math.max(16, Math.min(MAX_OUTPUT_TOKENS, Number(body?.maxOutputTokens || 1200)));
    const model = image ? VISION_MODEL : TEXT_MODEL;
    const aiMessages = [
      { role: "system", content: instructions },
      ...messages,
    ];

    try {
      const input = {
        messages: aiMessages,
        max_tokens: maxTokens,
        stream: false,
      };
      if (image) input.image = image;

      const result = await env.AI.run(model, input);
      const text = extractText(result);
      if (!text) return json({ ok: false, error: "AI provider returned an empty response." }, 503);

      return json({
        ok: true,
        text,
        provider: "cloudflare-workers-ai",
        model,
        paidFallback: false,
      });
    } catch (error) {
      const failure = classifyWorkerAiError(error);
      console.warn("Minarva free AI request failed", { code: failure.code });
      return json({ ok: false, error: failure.code }, failure.status);
    }
  },
};
