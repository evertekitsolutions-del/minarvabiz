import { createHmac } from "node:crypto";
import { adminDbFetch } from "./supabase-admin";
import { adminLoginBackoffSeconds } from "./login-backoff";

export type RateLimitDecision = {
  ok: boolean;
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  error?: string;
};

export type LoginBackoffDecision = {
  ok: boolean;
  allowed: boolean;
  failureCount: number;
  retryAfterSeconds: number;
  error?: string;
};

function rateLimitSecret(): string {
  const value = String(process.env.LICENSE_RATE_LIMIT_SECRET || "").trim();
  return value.length >= 32 ? value : "";
}

type HeaderReader = Pick<Headers, "get">;

function clientAddress(headers: HeaderReader): string {
  const forwarded = String(headers.get("x-forwarded-for") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return (
    String(headers.get("cf-connecting-ip") || "").trim() ||
    String(headers.get("x-real-ip") || "").trim() ||
    forwarded[0] ||
    "unknown"
  ).slice(0, 200);
}

function keyHash(headers: HeaderReader, subject = ""): string {
  const secret = rateLimitSecret();
  if (!secret) return "";
  const rawKey = `${clientAddress(headers)}|${subject}`;
  return createHmac("sha256", secret).update(rawKey).digest("hex");
}

function loginBackoffError(windowSeconds: number): LoginBackoffDecision {
  return {
    ok: false,
    allowed: false,
    failureCount: 0,
    retryAfterSeconds: windowSeconds,
    error: "Login backoff is not configured.",
  };
}

export async function consumeRateLimit(
  headers: HeaderReader,
  bucket: string,
  limit: number,
  windowSeconds: number,
  subject = ""
): Promise<RateLimitDecision> {
  const hash = keyHash(headers, subject);
  if (!hash) {
    return { ok: false, allowed: false, remaining: 0, retryAfterSeconds: windowSeconds, error: "Rate limiting is not configured." };
  }

  const result = await adminDbFetch<Array<{ allowed: boolean; remaining: number; reset_at: string }>>(
    "/rpc/consume_license_rate_limit",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        p_bucket: bucket,
        p_key_hash: hash,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      }),
    },
  );

  if (!result.ok || !Array.isArray(result.data) || !result.data[0]) {
    return {
      ok: false,
      allowed: false,
      remaining: 0,
      retryAfterSeconds: windowSeconds,
      error: result.error || "Rate-limit service unavailable.",
    };
  }

  const row = result.data[0];
  const resetAt = new Date(row.reset_at).getTime();
  const retryAfterSeconds = Number.isFinite(resetAt)
    ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
    : windowSeconds;

  return {
    ok: true,
    allowed: Boolean(row.allowed),
    remaining: Math.max(0, Number(row.remaining || 0)),
    retryAfterSeconds,
  };
}

export async function checkAdminLoginBackoff(headers: HeaderReader): Promise<LoginBackoffDecision> {
  const hash = keyHash(headers, "admin-login-backoff");
  if (!hash) return loginBackoffError(300);

  const result = await adminDbFetch<Array<{ allowed: boolean; failure_count: number; retry_after_seconds: number }>>(
    "/rpc/check_license_admin_login_backoff",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ p_key_hash: hash }),
    },
  );

  if (!result.ok || !Array.isArray(result.data) || !result.data[0]) {
    return {
      ok: false,
      allowed: false,
      failureCount: 0,
      retryAfterSeconds: 300,
      error: result.error || "Login backoff service unavailable.",
    };
  }

  const row = result.data[0];
  return {
    ok: true,
    allowed: Boolean(row.allowed),
    failureCount: Math.max(0, Number(row.failure_count || 0)),
    retryAfterSeconds: Math.max(0, Number(row.retry_after_seconds || 0)),
  };
}

export async function recordAdminLoginFailure(headers: HeaderReader): Promise<LoginBackoffDecision> {
  const hash = keyHash(headers, "admin-login-backoff");
  if (!hash) return loginBackoffError(300);

  const result = await adminDbFetch<Array<{ allowed: boolean; failure_count: number; retry_after_seconds: number }>>(
    "/rpc/record_license_admin_login_failure",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ p_key_hash: hash }),
    },
  );

  if (!result.ok || !Array.isArray(result.data) || !result.data[0]) {
    return {
      ok: false,
      allowed: false,
      failureCount: 0,
      retryAfterSeconds: 300,
      error: result.error || "Login backoff service unavailable.",
    };
  }

  const row = result.data[0];
  const failureCount = Math.max(1, Number(row.failure_count || 1));
  return {
    ok: true,
    allowed: Boolean(row.allowed),
    failureCount,
    retryAfterSeconds: Math.max(adminLoginBackoffSeconds(failureCount), Number(row.retry_after_seconds || 0)),
  };
}

export async function clearAdminLoginFailures(headers: HeaderReader): Promise<{ ok: boolean; error?: string }> {
  const hash = keyHash(headers, "admin-login-backoff");
  if (!hash) return { ok: false, error: "Login backoff is not configured." };

  const result = await adminDbFetch<boolean>("/rpc/clear_license_admin_login_failures", {
    method: "POST",
    body: JSON.stringify({ p_key_hash: hash }),
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error || "Login backoff service unavailable." };
}
