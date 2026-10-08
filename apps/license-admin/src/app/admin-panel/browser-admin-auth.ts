"use client";

import type { AdminIdentityView } from "./types";

import { licenseEdgeOrigin } from "./license-edge-config.ts";

const EDGE = licenseEdgeOrigin();

type AuthConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  passwordResetUrl: string;
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
  error_code?: string;
  error_description?: string;
  code?: string;
  msg?: string;
};

type BootstrapStatusResponse = {
  ok?: boolean;
  required?: boolean;
  configured?: boolean;
  code?: string;
};

type BootstrapSignupReservationResponse = {
  ok?: boolean;
  confirmationSent?: boolean;
  code?: string;
};

type BootstrapClaimResponse = {
  ok?: boolean;
  code?: string;
  identity?: {
    id?: string;
    email?: string;
    displayName?: string;
    role?: string;
  } | null;
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

type MfaUnenrollResponse = { id?: string; error?: string; message?: string };

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
  | { ok: true; accessToken: string; userId: string }
  | { ok: false; error: string };

export type BrowserAdminBootstrapStatusResult =
  | { ok: true; required: boolean; configured: boolean }
  | { ok: false; error: string };

type BootstrapActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; code?: string };

export type BrowserAdminIdentityResult =
  | { ok: true; identity: AdminIdentityView }
  | { ok: false; error: string; code?: string };

export type BrowserAdminBootstrapClaimResult =
  | { ok: true; identity: AdminIdentityView }
  | { ok: false; error: string; code?: string };

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
    const passwordResetUrl = String(data?.passwordResetUrl || "").trim();
    let resetUrl: URL | null = null;
    try {
      resetUrl = new URL(passwordResetUrl);
    } catch {
      resetUrl = null;
    }
    if (
      !response.ok ||
      !supabaseUrl.startsWith("https://") ||
      !supabaseUrl.endsWith(".supabase.co") ||
      supabasePublishableKey.length < 20 ||
      !resetUrl ||
      resetUrl.protocol !== "https:" ||
      resetUrl.pathname !== "/reset-password"
    ) {
      return null;
    }
    return { supabaseUrl, supabasePublishableKey, passwordResetUrl: resetUrl.toString() };
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

function bootstrapErrorMessage(code: string) {
  const messages: Record<string, string> = {
    UNAUTHENTICATED: "Administrator session expired. Sign in again.",
    MFA_REQUIRED: "Complete administrator MFA before claiming first-admin access.",
    BOOTSTRAP_EMAIL_MISMATCH: "This account is not the configured first administrator.",
    BOOTSTRAP_IDENTITY_NOT_VERIFIED: "Confirm the administrator email before continuing.",
    BOOTSTRAP_CLOSED: "First-administrator setup is already complete.",
    BOOTSTRAP_IDENTITY_IN_USE: "This account is already attached to a customer or business identity.",
    BOOTSTRAP_NOT_CONFIGURED: "First-administrator setup is not configured.",
    BOOTSTRAP_SERVICE_UNAVAILABLE: "First-administrator setup is temporarily unavailable.",
  };
  return messages[code] || "First-administrator setup failed.";
}

function validAal2Token(token: string, expectedUserId: string) {
  const claims = decodeJwtPayload(token);
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
  if (aal !== "aal2" || !usedTotp) return false;
  return (
    token.length >= 40 &&
    token.length <= 16384 &&
    validUuid(expectedUserId) &&
    subject === expectedUserId
  );
}

export async function getBrowserAdminBootstrapStatus(): Promise<BrowserAdminBootstrapStatusResult> {
  try {
    const response = await fetch(`${EDGE}/api/admin/bootstrap/status`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const data = (await response.json().catch(() => null)) as BootstrapStatusResponse | null;
    if (!response.ok || data?.ok !== true) {
      return { ok: false, error: bootstrapErrorMessage(String(data?.code || "BOOTSTRAP_SERVICE_UNAVAILABLE")) };
    }
    return {
      ok: true,
      required: data.required === true,
      configured: data.configured === true,
    };
  } catch {
    return { ok: false, error: "First-administrator setup is temporarily unavailable." };
  }
}

export async function createBrowserAdminSignupReservation(
  emailInput: string,
): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  const email = normalizeEmail(emailInput);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid administrator email.", code: "INVALID_REQUEST" };
  }

  try {
    const response = await fetch(`${EDGE}/api/admin/bootstrap/signup-reservation`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const data = (await response.json().catch(() => null)) as BootstrapSignupReservationResponse | null;
    const code = String(data?.code || "");
    if (!response.ok || data?.ok !== true || data?.confirmationSent !== true) {
      const messages: Record<string, string> = {
        INVALID_REQUEST: "Enter a valid administrator email.",
        RATE_LIMITED: "Too many first-administrator setup attempts. Try again later.",
        BOOTSTRAP_SIGNUP_NOT_ALLOWED: "Use the administrator email configured for this deployment.",
        BOOTSTRAP_CLOSED: "First-administrator setup is already complete.",
        BOOTSTRAP_USER_EXISTS: "An administrator account already exists for this email. Confirm the email if needed, then use password recovery before signing in.",
        BOOTSTRAP_IDENTITY_IN_USE: "This email is already attached to a customer or business identity.",
        BOOTSTRAP_RESERVATION_ACTIVE: "A first-administrator setup attempt is already active. Use the email already sent or try again after it expires.",
        BOOTSTRAP_AUTH_CREATE_FAILED: "The administrator account could not be created safely. Try again after the current setup window expires.",
        BOOTSTRAP_NOT_CONFIGURED: "First-administrator setup is not configured.",
        BOOTSTRAP_SERVICE_UNAVAILABLE: "First-administrator setup is temporarily unavailable.",
      };
      return {
        ok: false,
        error: messages[code] || "First-administrator signup could not be authorized.",
        code: code || undefined,
      };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "First-administrator setup is temporarily unavailable." };
  }
}

export async function beginBrowserFirstAdminSignup(
  emailInput: string,
): Promise<BootstrapActionResult> {
  const email = normalizeEmail(emailInput);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid administrator email." };
  }

  const status = await getBrowserAdminBootstrapStatus();
  if (!status.ok) return status;
  if (!status.required) return { ok: false, error: "First-administrator setup is already complete.", code: "BOOTSTRAP_CLOSED" };
  if (!status.configured) return { ok: false, error: "First-administrator setup is not configured.", code: "BOOTSTRAP_NOT_CONFIGURED" };

  const prepared = await createBrowserAdminSignupReservation(email);
  if (!prepared.ok) return prepared;

  return {
    ok: true,
    message: "Confirmation email sent. Confirm the address, then send yourself a password setup link before signing in.",
  };
}

export async function requestBrowserAdminPasswordSetup(
  emailInput: string,
): Promise<BootstrapActionResult> {
  const email = normalizeEmail(emailInput);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid administrator email." };
  }

  const config = await fetchAuthConfig();
  if (!config) return { ok: false, error: "Administrator authentication is unavailable." };

  const response = await authFetch<Record<string, unknown>>(
    config,
    `/recover?redirect_to=${encodeURIComponent(config.passwordResetUrl)}`,
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
  if (!response.ok) {
    if (response.status === 429) {
      return { ok: false, error: "Too many password setup requests. Try again later." };
    }
    return { ok: false, error: "Unable to send the password setup email." };
  }
  return {
    ok: true,
    message: "Password setup link sent. Choose your password, then return here to sign in and enroll MFA.",
  };
}

export async function resendBrowserFirstAdminConfirmation(
  emailInput: string,
): Promise<BootstrapActionResult> {
  const email = normalizeEmail(emailInput);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid administrator email." };
  }

  const status = await getBrowserAdminBootstrapStatus();
  if (!status.ok) return status;
  if (!status.required) return { ok: false, error: "First-administrator setup is already complete.", code: "BOOTSTRAP_CLOSED" };
  if (!status.configured) return { ok: false, error: "First-administrator setup is not configured.", code: "BOOTSTRAP_NOT_CONFIGURED" };

  const config = await fetchAuthConfig();
  if (!config) return { ok: false, error: "Administrator authentication is unavailable." };

  const response = await authFetch<Record<string, unknown>>(config, "/resend", {
    method: "POST",
    body: JSON.stringify({ type: "signup", email }),
  });
  if (!response.ok) {
    if (response.status === 429) return { ok: false, error: "Too many confirmation requests. Try again later." };
    return { ok: false, error: "Unable to resend the confirmation email." };
  }
  return { ok: true, message: "Confirmation email resent. Open it before signing in." };
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
  if (!pending || (pending.mode !== "enroll" && pending.mode !== "challenge")) {
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
  if (!verified.ok || !validAal2Token(upgradedAccessToken, pending.userId)) {
    return { ok: false, error: "Invalid authenticator code." };
  }

  return {
    ok: true,
    accessToken: upgradedAccessToken,
    userId: pending.userId,
  };
}

export async function getBrowserAdminIdentity(
  accessToken: string,
  expectedUserId: string,
): Promise<BrowserAdminIdentityResult> {
  if (!validAal2Token(accessToken, expectedUserId)) {
    return { ok: false, error: "Administrator MFA session is invalid.", code: "MFA_REQUIRED" };
  }
  try {
    const response = await fetch(`${EDGE}/api/admin/me`, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const data = await response.json().catch(() => null);
    const identity = data?.identity;
    const code = String(data?.code || "");
    const role = String(identity?.role || "");
    const identityEmail = normalizeEmail(identity?.email || "");
    const identityId = String(identity?.id || "");
    const displayName = String(identity?.displayName || "").trim();

    if (
      !response.ok ||
      data?.ok !== true ||
      identityId !== expectedUserId ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identityEmail) ||
      !displayName ||
      !["viewer", "operator", "admin"].includes(role)
    ) {
      return {
        ok: false,
        error: code === "ADMIN_NOT_ALLOWED"
          ? "This account is not an active License Admin."
          : "Administrator authorization failed.",
        code: code || undefined,
      };
    }

    return {
      ok: true,
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

export async function claimBrowserFirstAdmin(
  accessToken: string,
  expectedUserId: string,
): Promise<BrowserAdminBootstrapClaimResult> {
  if (!validAal2Token(accessToken, expectedUserId)) {
    return { ok: false, error: bootstrapErrorMessage("MFA_REQUIRED"), code: "MFA_REQUIRED" };
  }
  try {
    const response = await fetch(`${EDGE}/api/admin/bootstrap/claim`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const data = (await response.json().catch(() => null)) as BootstrapClaimResponse | null;
    const code = String(data?.code || "");
    if (!response.ok || data?.ok !== true) {
      return { ok: false, error: bootstrapErrorMessage(code || "BOOTSTRAP_SERVICE_UNAVAILABLE"), code: code || undefined };
    }

    const identity = data.identity;
    const id = String(identity?.id || "");
    const email = normalizeEmail(identity?.email || "");
    const displayName = String(identity?.displayName || "").trim();
    const role = String(identity?.role || "");
    if (
      id !== expectedUserId ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !displayName ||
      role !== "admin"
    ) {
      return { ok: false, error: "First-administrator identity response is invalid." };
    }

    return {
      ok: true,
      identity: { id, email, displayName, role: "admin", source: "supabase" },
    };
  } catch {
    return { ok: false, error: "First-administrator setup is temporarily unavailable." };
  }
}


export type BrowserAdminMfaFactor = { id: string; status: "verified" | "unverified" };

export async function listBrowserAdminMfaFactors(accessToken: string): Promise<{ ok: true; factors: BrowserAdminMfaFactor[] } | { ok: false; error: string }> {
  const claims = decodeJwtPayload(accessToken);
  const userId = String(claims?.sub || "");
  if (!validAal2Token(accessToken, userId)) return { ok: false, error: "Administrator MFA session is invalid." };
  const config = await fetchAuthConfig();
  if (!config) return { ok: false, error: "Administrator authentication is unavailable." };
  const response = await authFetch<{ all?: AuthFactor[]; totp?: AuthFactor[] }>(config, "/factors", { method: "GET" }, accessToken);
  if (!response.ok) return { ok: false, error: "Unable to read administrator authenticators." };
  const raw = Array.isArray(response.data?.totp) ? response.data?.totp : Array.isArray(response.data?.all) ? response.data?.all : [];
  const factors = raw.filter((factor) => String(factor?.factor_type || factor?.type || "").toLowerCase() === "totp")
    .map((factor) => ({ id: String(factor?.id || ""), status: factor?.status === "verified" ? "verified" as const : "unverified" as const }))
    .filter((factor) => validUuid(factor.id));
  return { ok: true, factors };
}

export async function unenrollBrowserAdminMfaFactor(accessToken: string, factorId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const claims = decodeJwtPayload(accessToken);
  const userId = String(claims?.sub || "");
  if (!validAal2Token(accessToken, userId) || !validUuid(factorId)) return { ok: false, error: "Administrator MFA session is invalid." };
  const config = await fetchAuthConfig();
  if (!config) return { ok: false, error: "Administrator authentication is unavailable." };
  const listed = await listBrowserAdminMfaFactors(accessToken);
  if (!listed.ok) return listed;
  const verified = listed.factors.filter((factor) => factor.status === "verified");
  if (!verified.some((factor) => factor.id === factorId)) return { ok: false, error: "Authenticator is not an active verified factor." };
  if (verified.length <= 1) return { ok: false, error: "Enroll and verify a replacement authenticator before removing the current factor." };
  const response = await authFetch<MfaUnenrollResponse>(config, `/factors/${encodeURIComponent(factorId)}`, { method: "DELETE" }, accessToken);
  return response.ok ? { ok: true } : { ok: false, error: "Unable to remove administrator authenticator." };
}
