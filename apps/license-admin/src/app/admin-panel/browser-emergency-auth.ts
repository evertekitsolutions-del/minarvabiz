"use client";

import type { AdminIdentityView } from "./types";

import { licenseEdgeOrigin } from "./license-edge-config";\n\nconst EDGE = licenseEdgeOrigin();

type EmergencyLoginResponse = {
  ok?: boolean;
  code?: string;
  sessionToken?: string;
  identity?: {
    id?: string;
    email?: string;
    displayName?: string;
    role?: string;
    source?: string;
  } | null;
  expiresAt?: string;
  retryAfterSeconds?: number;
};

export type BrowserEmergencyLoginResult =
  | {
      ok: true;
      sessionToken: string;
      identity: AdminIdentityView;
      expiresAt: string;
    }
  | { ok: false; error: string; code?: string };

function errorMessage(data: EmergencyLoginResponse | null, status: number) {
  const code = String(data?.code || "");
  const messages: Record<string, string> = {
    INVALID_REQUEST: "Enter a valid emergency administrator credential.",
    INVALID_EMERGENCY_CREDENTIAL: "Invalid emergency administrator credential.",
    RATE_LIMITED: "Too many emergency sign-in attempts. Try again later.",
    EMERGENCY_DISABLED: "Emergency administrator access is disabled.",
    EMERGENCY_NOT_CONFIGURED: "Emergency administrator access is not configured.",
    EMERGENCY_SERVICE_UNAVAILABLE: "Emergency administrator service is temporarily unavailable.",
    ORIGIN_NOT_ALLOWED: "This License Admin origin is not allowed to use emergency access.",
  };
  if (messages[code]) return messages[code];
  if (status === 429) return "Too many emergency sign-in attempts. Try again later.";
  return "Emergency administrator sign-in failed.";
}

function validIdentity(value: EmergencyLoginResponse["identity"]): value is {
  id: string;
  email: string;
  displayName: string;
  role: "admin";
  source: "emergency";
} {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      value.id.length >= 1 &&
      value.id.length <= 200 &&
      typeof value.email === "string" &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) &&
      typeof value.displayName === "string" &&
      value.displayName.trim() &&
      value.role === "admin" &&
      value.source === "emergency"
  );
}

export async function beginBrowserEmergencyLogin(
  credentialInput: string,
): Promise<BrowserEmergencyLoginResult> {
  const credential = String(credentialInput || "");
  if (!credential || credential.length > 2048) {
    return { ok: false, error: "Enter a valid emergency administrator credential.", code: "INVALID_REQUEST" };
  }

  try {
    const response = await fetch(`${EDGE}/api/admin/emergency/login`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ credential }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const data = (await response.json().catch(() => null)) as EmergencyLoginResponse | null;
    const sessionToken = String(data?.sessionToken || "");
    const expiresAt = String(data?.expiresAt || "");
    const expiresAtMs = Date.parse(expiresAt);

    if (
      !response.ok ||
      data?.ok !== true ||
      !/^[A-Za-z0-9_-]{64}$/.test(sessionToken) ||
      !validIdentity(data.identity) ||
      !Number.isFinite(expiresAtMs) ||
      expiresAtMs <= Date.now() + 15_000
    ) {
      return {
        ok: false,
        error: errorMessage(data, response.status),
        code: String(data?.code || "") || undefined,
      };
    }

    return {
      ok: true,
      sessionToken,
      identity: {
        id: data.identity.id,
        email: data.identity.email.toLowerCase(),
        displayName: data.identity.displayName.trim(),
        role: "admin",
        source: "emergency",
      },
      expiresAt,
    };
  } catch {
    return { ok: false, error: "Emergency administrator service is temporarily unavailable." };
  }
}
