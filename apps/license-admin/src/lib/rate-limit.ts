import { createHmac } from "node:crypto";
import { adminDbFetch } from "./supabase-admin";

export type RateLimitDecision = {
  ok: boolean;
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  error?: string;
};

function rateLimitSecret(): string {
  return String(process.env.LICENSE_RATE_LIMIT_SECRET || "").trim();
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

export async function consumeRateLimit(
  headers: HeaderReader,
  bucket: string,
  limit: number,
  windowSeconds: number,
  subject = ""
): Promise<RateLimitDecision> {
  const secret = rateLimitSecret();
  if (!secret) {
    return { ok: false, allowed: false, remaining: 0, retryAfterSeconds: windowSeconds, error: "Rate limiting is not configured." };
  }

  const rawKey = `${clientAddress(headers)}|${subject}`;
  const keyHash = createHmac("sha256", secret).update(rawKey).digest("hex");
  const result = await adminDbFetch<Array<{ allowed: boolean; remaining: number; reset_at: string }>>(
    "/rpc/consume_license_rate_limit",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        p_bucket: bucket,
        p_key_hash: keyHash,
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
