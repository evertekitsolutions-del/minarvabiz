"use client";

import type { AdminIdentityView } from "./types";

const EDGE = "https://minarva-biz-license-edge.minarva-biz.workers.dev";

type AuthConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

type AuthFactor = {
  id?: string;
  factor_type?: string;
  type?: string;
  status?: string;
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
  error?: string;
  message?: string;
};

type MfaVerifyResponse = {
  access_token?: string;
  error?: string;
  message?: string;
};

export type BrowserAdminPendingAuth = {
  config: AuthConfig;
  accessToken: string;
  userId: string;
  mode: "enroll" | "challenge";
  factorId?: string;
  challengeId?: string;
};

type LoginResult =
  | { ok: true; next: "enroll" | "mfa"; pending: BrowserAdminPendingAuth }
  | { ok: false; error: string };

type EnrollmentResult =
  | {
      ok: true;
      pending: BrowserAdminPendingAuth;
      secret: string;
      qrCode: string;
      uri: string;
    }
  | { ok: false; error: string };

type VerifyResult =
  | { ok: true; accessToken: string; identity: AdminIdentityView }
  | { ok: false; error: string };

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "";
}

function verifiedTotpFactorIds(user: AuthUser | null | undefined): string[] {
  const factors = Array.isArray(user?.factors) ? user.factors : [];
  return factors
    .filter((factor) => {
      const type = String(factor?.factor_type || factor?.type || "").toLowerCase();
      return type === "totp" && factor?.status === "verified";
    })
    .map((factor) => String(factor?.id || ""))
    .filter(validUuid);
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

async function fetchAuthConfig(): Promise<AuthConfig | null> {
  try {
    const response = await fetch(`${EDGE}/api/admin/auth-config`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const data = await response.json().catch(() => null);
    const supabaseUrl = String(data?.supabaseUrl || "").replace(/\/$/, "");
    const supabasePublishableKey = String(data?.supabasePublishableKey || "").trim();
    if (
      !response.ok ||
      !supabaseUrl.startsWith("https://") ||
      !supabaseUrl.endsWith(".supabase.co") ||
      supabasePublishableKey.length < 20
    ) {
      return null;
    }
    return { supabaseUrl, supabasePublishableKey };
  } catch {
    return null;
  }
}

async function authFetch<T>(
  config: AuthConfig,
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const headers = new Headers(init.headers);
  headers.set("apikey", config.supabasePublishableKey);
  headers.set("content-type", "application/json");
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);

  try {
    const response = await fetch(`${config.supabaseUrl}/auth/v1${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(10_000),
    });
    const data = (await response.json().catch(() => null)) as T | null;
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 503, data: null };
  }
}

async function beginChallenge(
  pending: Pick<BrowserAdminPendingAuth, "config" | "accessToken" | "userId">,
  factorId: string,
): Promise<LoginResult> {
  const challenge = await authFetch<MfaChallengeResponse>(
    pending.config,
    `/factors/${encodeURIComponent(factorId)}/challenge`,
    { method: "POST", body: "{}" },
    pending.accessToken,
  );
  const challengeId = String(challenge.data?.id || "");
  if (!challenge.ok || !validUuid(challengeId)) {
    return { ok: false, error: "Unable to start administrator MFA challenge." };
  }
  return {
    ok: true,
    next: "mfa",
    pending: {
      ...pending,
      mode: "challenge",
      factorId,
      challengeId,
    },
  };
}

export async function beginBrowserNamedAdminLogin(
  emailInput: string,
  password: string,
): Promise<LoginResult> {
  const email = normalizeEmail(emailInput);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 2048) {
    return { ok: false, error: "Invalid administrator credentials." };
  }

  const config = await fetchAuthConfig();
  if (!config) return { ok: false, error: "Administrator authentication is unavailable." };

  const response = await authFetch<PasswordAuthResponse>(
    config,
    "/token?grant_type=password",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
  );

  const accessToken = String(response.data?.access_token || "");
  const userId = String(response.data?.user?.id || "").trim();
  const authEmail = normalizeEmail(response.data?.user?.email || "");
  if (
    !response.ok ||
    !validUuid(userId) ||
    authEmail !== email ||
    accessToken.length < 40 ||
    accessToken.length > 16384
  ) {
    return { ok: false, error: "Invalid administrator credentials." };
  }

  const pending = { config, accessToken, userId };
  const factorId = verifiedTotpFactorIds(response.data?.user)[0] || "";
  if (factorId) return beginChallenge(pending, factorId);

  return {
    ok: true,
    next: "enroll",
    pending: {
      ...pending,
      mode: "enroll",
    },
  };
}

export async function beginBrowserAdminMfaEnrollment(
  pending: BrowserAdminPendingAuth | null,
): Promise<EnrollmentResult> {
  if (!pending || pending.mode !== "enroll") {
    return { ok: false, error: "Administrator MFA enrollment has expired. Sign in again." };
  }

  const enrolled = await authFetch<MfaEnrollResponse>(
    pending.config,
    "/factors",
    {
      method: "POST",
      body: JSON.stringify({
        factor_type: "totp",
        friendly_name: `Minarva Biz License Admin ${new Date().toISOString().slice(0, 16)}`,
      }),
    },
    pending.accessToken,
  );
  const factorId = String(enrolled.data?.id || "");
  const secret = String(enrolled.data?.totp?.secret || "");
  const qrCode = String(enrolled.data?.totp?.qr_code || "");
  const uri = String(enrolled.data?.totp?.uri || "");

  if (!enrolled.ok || !validUuid(factorId) || !secret || secret.length > 512) {
    return { ok: false, error: "Unable to enroll administrator authenticator." };
  }

  const challenge = await beginChallenge(pending, factorId);
  if (!challenge.ok) return challenge;

  return {
    ok: true,
    pending: challenge.pending,
    secret: secret.slice(0, 512),
    qrCode: qrCode.slice(0, 100000),
    uri: uri.slice(0, 4096),
  };
}

export async function verifyBrowserAdminMfa(
  pending: BrowserAdminPendingAuth | null,
  codeInput: string,
): Promise<VerifyResult> {
  const code = String(codeInput || "").trim();
  if (
    !pending ||
    pending.mode !== "challenge" ||
    !pending.factorId ||
    !pending.challengeId ||
    !validUuid(pending.factorId) ||
    !validUuid(pending.challengeId)
  ) {
    return { ok: false, error: "Administrator MFA challenge has expired. Sign in again." };
  }
  if (!/^[0-9]{6,10}$/.test(code)) {
    return { ok: false, error: "Enter a valid authenticator code." };
  }

  const verified = await authFetch<MfaVerifyResponse>(
    pending.config,
    `/factors/${encodeURIComponent(pending.factorId)}/verify`,
    {
      method: "POST",
      body: JSON.stringify({ challenge_id: pending.challengeId, code }),
    },
    pending.accessToken,
  );

  const upgradedAccessToken = String(verified.data?.access_token || "");
  const claims = decodeJwtPayload(upgradedAccessToken);
  const aal = String(claims?.aal || "");
  const subject = String(claims?.sub || "");
  const amr = Array.isArray(claims?.amr) ? claims.amr : [];
  const usedTotp = amr.some((entry) => {
    if (typeof entry === "string") return entry === "totp";
    return Boolean(
      entry &&
      typeof entry === "object" &&
      (entry as { method?: unknown }).method === "totp",
    );
  });

  if (
    !verified.ok ||
    upgradedAccessToken.length < 40 ||
    upgradedAccessToken.length > 16384 ||
    aal !== "aal2" ||
    subject !== pending.userId ||
    !usedTotp
  ) {
    return { ok: false, error: "Invalid authenticator code." };
  }

  try {
    const response = await fetch(`${EDGE}/api/admin/me`, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${upgradedAccessToken}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const data = await response.json().catch(() => null);
    const identity = data?.identity;
    const role = String(identity?.role || "");
    const identityEmail = normalizeEmail(identity?.email || "");
    const identityId = String(identity?.id || "");
    const displayName = String(identity?.displayName || "").trim();

    if (
      !response.ok ||
      data?.ok !== true ||
      identityId !== pending.userId ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identityEmail) ||
      !displayName ||
      !["viewer", "operator", "admin"].includes(role)
    ) {
      return { ok: false, error: "This account is not an active License Admin." };
    }

    return {
      ok: true,
      accessToken: upgradedAccessToken,
      identity: {
        id: identityId,
        email: identityEmail,
        displayName,
        source: "supabase",
        role: role as AdminIdentityView["role"],
      },
    };
  } catch {
    return { ok: false, error: "Administrator authorization is temporarily unavailable." };
  }
}
