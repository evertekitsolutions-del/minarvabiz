import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.2";

const TEAM_SLUG = "minarva-biz";
const TEAM_ID = "team_I74uWi3aeWhymbb4apEZ3nnq";
const PROJECT_NAME = "minarvabiz";
const PROJECT_ID = "prj_GgZIaN5Q1SqS5oU5Ax89z4itcust";
const EXPECTED_SUBJECT = `owner:${TEAM_SLUG}:project:${PROJECT_NAME}:environment:production`;
const EXPECTED_AUDIENCE = `https://vercel.com/${TEAM_SLUG}`;
const TEAM_ISSUER = `https://oidc.vercel.com/${TEAM_SLUG}`;
const GLOBAL_ISSUER = "https://oidc.vercel.com";
const JWKS = createRemoteJWKSet(new URL("https://oidc.vercel.com/.well-known/jwks"));

const RATE_POLICIES: Record<string, { limit: number; windowSeconds: number }> = {
  "support-chat-minute": { limit: 8, windowSeconds: 60 },
  "support-chat-hour": { limit: 40, windowSeconds: 3600 },
  "support-submit-day": { limit: 20, windowSeconds: 86400 },
};

const TYPES = new Set(["technical_escalation", "bug", "feature_request", "suggestion"]);
const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function verifyVercelOidc(req: Request) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new Error("Missing Vercel OIDC token.");

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: [TEAM_ISSUER, GLOBAL_ISSUER],
    audience: EXPECTED_AUDIENCE,
    subject: EXPECTED_SUBJECT,
  });

  if (
    payload.owner_id !== TEAM_ID ||
    payload.project_id !== PROJECT_ID ||
    payload.project !== PROJECT_NAME ||
    payload.environment !== "production"
  ) {
    throw new Error("OIDC project identity mismatch.");
  }
}

async function hmacHex(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  try {
    await verifyVercelOidc(req);
  } catch {
    return json({ ok: false, error: "Unauthorized support broker request." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: "Support broker database credentials are unavailable." }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON request." }, 400);
  }

  const op = clean(body?.op, 40);

  if (op === "health") {
    const { error } = await supabase.from("support_requests").select("id").limit(1);
    return error
      ? json({ ok: false, error: "Support database is unavailable." }, 503)
      : json({ ok: true, service: "minarva-support-broker" });
  }

  if (op === "readiness") {
    const checks = {
      database: false,
      rateLimit: false,
      submissionWrite: false,
      cleanup: false,
    };

    const { error: selectError } = await supabase.from("support_requests").select("id").limit(1);
    checks.database = !selectError;
    if (!checks.database) {
      return json({ ok: false, service: "minarva-support-broker", checks, error: "Support database read failed." }, 503);
    }

    const readinessHash = await hmacHex(serviceRoleKey, "support-readiness");
    const { data: rateData, error: rateError } = await supabase.rpc("consume_license_rate_limit", {
      p_bucket: "support-readiness",
      p_key_hash: readinessHash,
      p_limit: 100000,
      p_window_seconds: 60,
    });
    checks.rateLimit = !rateError && Array.isArray(rateData) && Boolean(rateData[0]);
    if (!checks.rateLimit) {
      return json({ ok: false, service: "minarva-support-broker", checks, error: "Support rate-limit RPC failed." }, 503);
    }

    const probeId = crypto.randomUUID();
    const probePayload = {
      id: probeId,
      request_type: "suggestion",
      status: "resolved",
      priority: "low",
      title: "__minarva_support_readiness__",
      description: "Synthetic readiness probe. This row should be deleted immediately.",
      module: "support-readiness",
      organization_name: "Minarva Biz",
      app_version: null,
      edition: "system",
      platform: "vercel",
      transcript: [],
      metadata: { syntheticReadiness: true },
      resolved_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase.from("support_requests").insert(probePayload);
    checks.submissionWrite = !insertError;
    if (!checks.submissionWrite) {
      return json({ ok: false, service: "minarva-support-broker", checks, error: "Support inbox write failed." }, 503);
    }

    const { error: deleteError } = await supabase.from("support_requests").delete().eq("id", probeId);
    checks.cleanup = !deleteError;
    if (!checks.cleanup) {
      return json({ ok: false, service: "minarva-support-broker", checks, error: "Support readiness cleanup failed." }, 503);
    }

    return json({ ok: true, service: "minarva-support-broker", checks });
  }

  if (op === "rate-limit") {
    const bucket = clean(body?.bucket, 80);
    const policy = RATE_POLICIES[bucket];
    const address = clean(body?.clientAddress, 200);
    if (!policy || !address) return json({ ok: false, error: "Invalid support rate-limit request." }, 400);

    const keyHash = await hmacHex(serviceRoleKey, `support-rate|${address}`);
    const { data, error } = await supabase.rpc("consume_license_rate_limit", {
      p_bucket: bucket,
      p_key_hash: keyHash,
      p_limit: policy.limit,
      p_window_seconds: policy.windowSeconds,
    });
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row) return json({ ok: false, error: "Support rate-limit service is unavailable." }, 503);

    return json({
      ok: true,
      allowed: Boolean(row.allowed),
      remaining: Math.max(0, Number(row.remaining || 0)),
      resetAt: row.reset_at || null,
    });
  }

  if (op === "create-request") {
    const request = body?.request && typeof body.request === "object" ? body.request : {};
    const requestType = clean(request.request_type, 40);
    const priority = clean(request.priority, 20);
    const title = clean(request.title, 200);
    const description = clean(request.description, 12000);

    if (!TYPES.has(requestType) || !PRIORITIES.has(priority) || !title || !description) {
      return json({ ok: false, error: "Invalid support request." }, 400);
    }

    const transcript = (Array.isArray(request.transcript) ? request.transcript : [])
      .slice(-20)
      .map((message: any) => ({
        role: message?.role === "assistant" ? "assistant" : "user",
        content: clean(message?.content, 4000),
      }))
      .filter((message: { content: string }) => message.content);

    const clientId = clean(request.client_id, 160);
    const payload = {
      request_type: requestType,
      status: "new",
      priority,
      title,
      description,
      module: clean(request.module, 120) || null,
      organization_name: clean(request.organization_name, 200) || null,
      contact_email: clean(request.contact_email, 320).toLowerCase() || null,
      app_version: clean(request.app_version, 80) || null,
      edition: clean(request.edition, 40) || null,
      platform: clean(request.platform, 120) || null,
      client_hash: clientId ? await hmacHex(serviceRoleKey, `support-client|${clientId}`) : null,
      ai_summary: clean(request.ai_summary, 4000) || null,
      screenshot_summary: clean(request.screenshot_summary, 4000) || null,
      transcript,
      metadata: request.metadata && typeof request.metadata === "object" && !Array.isArray(request.metadata)
        ? request.metadata
        : {},
    };

    const { data, error } = await supabase
      .from("support_requests")
      .insert(payload)
      .select("id")
      .single();

    if (error || !data?.id) return json({ ok: false, error: "Unable to store support request." }, 503);
    return json({ ok: true, requestId: String(data.id) }, 201);
  }

  return json({ ok: false, error: "Unsupported support broker operation." }, 400);
});
