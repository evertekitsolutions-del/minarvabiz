"use client";

const STORAGE_KEY = "minarvabiz-license-admin-aal2-v1";

export interface BrowserAdminSession {
  accessToken: string;
  userId: string;
  expiresAt: number;
  supabaseUrl: string;
  supabasePublishableKey: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isValidSession(value: unknown): value is BrowserAdminSession {
  if (!value || typeof value !== "object") return false;
  const row = value as BrowserAdminSession;
  if (
    typeof row.accessToken !== "string" ||
    row.accessToken.length < 40 ||
    row.accessToken.length > 16384 ||
    typeof row.userId !== "string" ||
    typeof row.expiresAt !== "number" ||
    typeof row.supabaseUrl !== "string" ||
    typeof row.supabasePublishableKey !== "string"
  ) return false;

  const claims = decodeJwtPayload(row.accessToken);
  const subject = String(claims?.sub || "");
  const aal = String(claims?.aal || "");
  const exp = Number(claims?.exp || 0);
  const amr = Array.isArray(claims?.amr) ? claims.amr : [];
  const hasTotp = amr.some((entry) => {
    if (typeof entry === "string") return entry === "totp";
    return Boolean(entry && typeof entry === "object" && (entry as { method?: unknown }).method === "totp");
  });

  return (
    subject === row.userId &&
    aal === "aal2" &&
    hasTotp &&
    Number.isFinite(exp) &&
    exp > Math.floor(Date.now() / 1000) + 15 &&
    row.expiresAt === exp &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(row.supabaseUrl) &&
    row.supabasePublishableKey.length >= 20 &&
    !/service_role|sb_secret_/i.test(row.supabasePublishableKey)
  );
}

export function persistBrowserAdminSession(input: {
  accessToken: string;
  userId: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
}) {
  const claims = decodeJwtPayload(input.accessToken);
  const expiresAt = Number(claims?.exp || 0);
  const session: BrowserAdminSession = {
    accessToken: input.accessToken,
    userId: input.userId,
    expiresAt,
    supabaseUrl: input.supabaseUrl.replace(/\/$/, ""),
    supabasePublishableKey: input.supabasePublishableKey.trim(),
  };
  if (!isValidSession(session)) return false;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function readBrowserAdminSession(): BrowserAdminSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidSession(parsed)) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearBrowserAdminSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Browser storage may be unavailable; the in-memory caller still signs out.
  }
}

export async function signOutBrowserAdminSession() {
  const session = readBrowserAdminSession();
  clearBrowserAdminSession();
  if (!session) return;

  try {
    await fetch(`${session.supabaseUrl}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: {
        apikey: session.supabasePublishableKey,
        authorization: `Bearer ${session.accessToken}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // Local sign-out must still succeed when the auth service is temporarily unavailable.
  }
}
