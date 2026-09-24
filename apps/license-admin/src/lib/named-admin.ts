import type { AdminIdentity } from "./admin-session";
import { isAdminRole } from "./admin-rbac";
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

type AuthFactor = {
  id?: string;
  factor_type?: string;
  type?: string;
  status?: string;
  friendly_name?: string;
};

type AuthUser = {
  id?: string;
  email?: string | null;
  factors?: AuthFactor[] | null;
};

type PasswordAuthResponse = {
  access_token?: string;
  user?: AuthUser | null;
  error?: string;
  error_description?: string;
  msg?: string;
};

type MfaEnrollResponse = {
  id?: string;
  type?: string;
  friendly_name?: string;
  totp?: {
    qr_code?: string;
    secret?: string;
    uri?: string;
  } | null;
  error?: string;
  message?: string;
};

type MfaChallengeResponse = {
  id?: string;
  expires_at?: number;
  error?: string;
  message?: string;
};

type MfaVerifyResponse = {
  access_token?: string;
  error?: string;
  message?: string;
};

type IdentityRow = {
  auth_user_id: string;
  email: string;
  display_name: string;
  status: "active" | "disabled";
  role: string;
};

export type NamedAdminAuthResult =
  | {
      ok: true;
      identity: AdminIdentity;
      accessToken: string;
      verifiedTotpFactorIds: string[];
    }
  | { ok: false; error: string; rejected: boolean };

async function authFetch<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const cfg = authConfig();
  if (!cfg) return { ok: false, status: 503, data: null };
  const headers = new Headers(init.headers);
  headers.set("apikey", cfg.key);
  headers.set("content-type", "application/json");
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  try {
    const response = await fetch(`${cfg.base}/auth/v1${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as T | null;
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 503, data: null };
  }
}

function verifiedTotpFactors(user: AuthUser | null | undefined): string[] {
  const factors = Array.isArray(user?.factors) ? user?.factors : [];
  return factors
    .filter((factor) => {
      const type = String(factor?.factor_type || factor?.type || "").toLowerCase();
      return type === "totp" && factor?.status === "verified";
    })
    .map((factor) => String(factor?.id || ""))
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id));
}

export async function authenticateNamedAdmin(emailInput: unknown, passwordInput: unknown): Promise<NamedAdminAuthResult> {
  const email = normalizeAdminEmail(emailInput);
  const password = typeof passwordInput === "string" ? passwordInput : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 2048) {
    return { ok: false, error: "Invalid administrator credentials.", rejected: true };
  }

  if (!authConfig()) {
    return { ok: false, error: "Named administrator authentication is not configured.", rejected: false };
  }

  const authResponse = await authFetch<PasswordAuthResponse>("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const authData = authResponse.data;
  const accessToken = String(authData?.access_token || "");
  const userId = String(authData?.user?.id || "").trim();
  const authEmail = normalizeAdminEmail(authData?.user?.email || "");
  if (!authResponse.ok || !userId || !authEmail || accessToken.length < 40 || accessToken.length > 16384) {
    return { ok: false, error: "Invalid administrator credentials.", rejected: true };
  }

  const allowlist = await adminDbFetch<IdentityRow[]>(
    `/license_admin_identities?select=auth_user_id%2Cemail%2Cdisplay_name%2Cstatus%2Crole&auth_user_id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  if (!allowlist.ok) {
    return { ok: false, error: "Administrator identity registry is unavailable.", rejected: false };
  }

  const row = Array.isArray(allowlist.data) ? allowlist.data[0] : null;
  const rowEmail = normalizeAdminEmail(row?.email || "");
  const displayName = String(row?.display_name || "").trim();
  if (!row || row.status !== "active" || rowEmail !== authEmail || !displayName || displayName.length > 120 || !isAdminRole(row.role)) {
    return { ok: false, error: "Invalid administrator credentials.", rejected: true };
  }

  let factors = verifiedTotpFactors(authData?.user);
  if (!factors.length) {
    const userResponse = await authFetch<AuthUser>("/user", { method: "GET" }, accessToken);
    if (userResponse.ok) factors = verifiedTotpFactors(userResponse.data);
  }

  return {
    ok: true,
    identity: {
      id: userId,
      email: authEmail,
      displayName,
      source: "supabase",
      role: row.role,
    },
    accessToken,
    verifiedTotpFactorIds: factors,
  };
}

export async function beginNamedAdminMfaChallenge(
  accessToken: string,
  factorId: string,
): Promise<{ ok: true; challengeId: string } | { ok: false; error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(factorId)) return { ok: false, error: "Administrator MFA factor is invalid." };
  const challenge = await authFetch<MfaChallengeResponse>(
    `/factors/${encodeURIComponent(factorId)}/challenge`,
    { method: "POST", body: "{}" },
    accessToken,
  );
  const challengeId = String(challenge.data?.id || "");
  if (!challenge.ok || !/^[0-9a-f-]{36}$/i.test(challengeId)) {
    return { ok: false, error: "Unable to start administrator MFA challenge." };
  }
  return { ok: true, challengeId };
}

export async function beginNamedAdminTotpEnrollment(
  accessToken: string,
): Promise<
  | { ok: true; factorId: string; challengeId: string; qrCode: string; secret: string; uri: string }
  | { ok: false; error: string }
> {
  const enrolled = await authFetch<MfaEnrollResponse>(
    "/factors",
    {
      method: "POST",
      body: JSON.stringify({
        factor_type: "totp",
        friendly_name: `Minarva Biz License Admin ${new Date().toISOString().slice(0, 16)}`,
      }),
    },
    accessToken,
  );
  const factorId = String(enrolled.data?.id || "");
  const secret = String(enrolled.data?.totp?.secret || "");
  const qrCode = String(enrolled.data?.totp?.qr_code || "");
  const uri = String(enrolled.data?.totp?.uri || "");
  if (!enrolled.ok || !/^[0-9a-f-]{36}$/i.test(factorId) || !secret || secret.length > 512) {
    return { ok: false, error: "Unable to enroll administrator authenticator." };
  }

  const challenge = await beginNamedAdminMfaChallenge(accessToken, factorId);
  if (!challenge.ok) return challenge;
  return { ok: true, factorId, challengeId: challenge.challengeId, qrCode, secret, uri };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function verifyNamedAdminMfa(
  accessToken: string,
  factorId: string,
  challengeId: string,
  codeInput: unknown,
  expectedUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = typeof codeInput === "string" ? codeInput.trim() : "";
  if (!/^[0-9]{6,10}$/.test(code)) return { ok: false, error: "Enter a valid authenticator code." };
  if (!/^[0-9a-f-]{36}$/i.test(factorId) || !/^[0-9a-f-]{36}$/i.test(challengeId)) {
    return { ok: false, error: "Administrator MFA challenge is invalid." };
  }

  const verified = await authFetch<MfaVerifyResponse>(
    `/factors/${encodeURIComponent(factorId)}/verify`,
    {
      method: "POST",
      body: JSON.stringify({ challenge_id: challengeId, code }),
    },
    accessToken,
  );
  const upgradedAccessToken = String(verified.data?.access_token || "");
  const claims = decodeJwtPayload(upgradedAccessToken);
  const aal = String(claims?.aal || "");
  const subject = String(claims?.sub || "");
  const amr = Array.isArray(claims?.amr) ? claims?.amr : [];
  const usedTotp = amr.some((entry) => {
    if (typeof entry === "string") return entry === "totp";
    return Boolean(entry && typeof entry === "object" && (entry as { method?: unknown }).method === "totp");
  });
  if (!verified.ok || aal !== "aal2" || subject !== expectedUserId || !usedTotp) {
    return { ok: false, error: "Invalid authenticator code." };
  }
  return { ok: true };
}
