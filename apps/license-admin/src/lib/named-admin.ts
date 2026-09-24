import type { AdminIdentity } from "./admin-session";
import { adminDbFetch } from "./supabase-admin";

export function normalizeAdminEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "";
}

function authConfig() {
  const base = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = String(
    process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  ).trim();
  return base && key ? { base, key } : null;
}

type PasswordAuthResponse = {
  user?: { id?: string; email?: string | null } | null;
  error?: string;
  error_description?: string;
  msg?: string;
};

type IdentityRow = {
  auth_user_id: string;
  email: string;
  display_name: string;
  status: "active" | "disabled";
};

export type NamedAdminAuthResult =
  | { ok: true; identity: AdminIdentity }
  | { ok: false; error: string; rejected: boolean };

export async function authenticateNamedAdmin(emailInput: unknown, passwordInput: unknown): Promise<NamedAdminAuthResult> {
  const email = normalizeAdminEmail(emailInput);
  const password = typeof passwordInput === "string" ? passwordInput : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 2048) {
    return { ok: false, error: "Invalid administrator credentials.", rejected: true };
  }

  const cfg = authConfig();
  if (!cfg) {
    return { ok: false, error: "Named administrator authentication is not configured.", rejected: false };
  }

  let authResponse: Response;
  try {
    authResponse = await fetch(`${cfg.base}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Administrator authentication service is temporarily unavailable.", rejected: false };
  }

  const authData = (await authResponse.json().catch(() => null)) as PasswordAuthResponse | null;
  const userId = String(authData?.user?.id || "").trim();
  const authEmail = normalizeAdminEmail(authData?.user?.email || "");
  if (!authResponse.ok || !userId || !authEmail) {
    return { ok: false, error: "Invalid administrator credentials.", rejected: true };
  }

  const allowlist = await adminDbFetch<IdentityRow[]>(
    `/license_admin_identities?select=auth_user_id%2Cemail%2Cdisplay_name%2Cstatus&auth_user_id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  if (!allowlist.ok) {
    return { ok: false, error: "Administrator identity registry is unavailable.", rejected: false };
  }

  const row = Array.isArray(allowlist.data) ? allowlist.data[0] : null;
  const rowEmail = normalizeAdminEmail(row?.email || "");
  const displayName = String(row?.display_name || "").trim();
  if (!row || row.status !== "active" || rowEmail !== authEmail || !displayName || displayName.length > 120) {
    return { ok: false, error: "Invalid administrator credentials.", rejected: true };
  }

  return {
    ok: true,
    identity: {
      id: userId,
      email: authEmail,
      displayName,
      source: "supabase",
    },
  };
}
