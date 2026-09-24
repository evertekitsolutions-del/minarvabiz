import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "minarva-license-admin";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const MIN_EMERGENCY_ADMIN_SECRET_LENGTH = 32;
export const MAX_PREVIOUS_SECRET_GRACE_MS = 24 * 60 * 60 * 1000;

function envSecret(name: string): string {
  return String(process.env[name] || "").trim();
}

function sessionSecret(): string {
  const value = envSecret("LICENSE_SESSION_SECRET");
  return value.length >= 32 ? value : "";
}

export function emergencyAdminLoginEnabled(): boolean {
  return envSecret("LICENSE_ADMIN_EMERGENCY_LOGIN_ENABLED").toLowerCase() === "true";
}

export type EmergencyAdminCredentialMatch = "current" | "previous";

export function emergencyAdminCredentialStatus(nowMs = Date.now()) {
  const current = envSecret("LICENSE_API_SECRET");
  const previous = envSecret("LICENSE_API_SECRET_PREVIOUS");
  const rawPreviousValidUntil = envSecret("LICENSE_API_SECRET_PREVIOUS_VALID_UNTIL");
  const previousValidUntilMs = rawPreviousValidUntil ? new Date(rawPreviousValidUntil).getTime() : Number.NaN;
  const previousConfigured = previous.length >= MIN_EMERGENCY_ADMIN_SECRET_LENGTH;
  const previousActive =
    previousConfigured &&
    Number.isFinite(previousValidUntilMs) &&
    previousValidUntilMs > nowMs &&
    previousValidUntilMs <= nowMs + MAX_PREVIOUS_SECRET_GRACE_MS;

  return {
    enabled: emergencyAdminLoginEnabled(),
    currentConfigured: current.length >= MIN_EMERGENCY_ADMIN_SECRET_LENGTH,
    previousConfigured,
    previousActive,
    previousValidUntil: previousActive ? new Date(previousValidUntilMs).toISOString() : null,
  };
}

export function timingSafeStringEqual(left: string, right: string): boolean {
  const a = createHash("sha256").update(String(left), "utf8").digest();
  const b = createHash("sha256").update(String(right), "utf8").digest();
  return timingSafeEqual(a, b);
}

export function verifyEmergencyAdminCredential(
  suppliedCredential: string,
  nowMs = Date.now(),
): EmergencyAdminCredentialMatch | null {
  const supplied = String(suppliedCredential || "");
  const status = emergencyAdminCredentialStatus(nowMs);
  if (!status.enabled || !status.currentConfigured || !supplied || supplied.length > 2048) return null;

  const current = envSecret("LICENSE_API_SECRET");
  const previous = envSecret("LICENSE_API_SECRET_PREVIOUS");
  const currentMatch = timingSafeStringEqual(current, supplied);
  const previousMatch = status.previousActive ? timingSafeStringEqual(previous, supplied) : false;

  if (currentMatch) return "current";
  if (previousMatch) return "previous";
  return null;
}

function sign(body: string): string {
  const secret = sessionSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createAdminSessionToken(nowMs = Date.now()): string {
  if (!sessionSecret()) return "";
  const expiresAt = nowMs + SESSION_TTL_SECONDS * 1000;
  const nonce = randomBytes(32).toString("base64url");
  const body = `v1.${expiresAt}.${nonce}`;
  const signature = sign(body);
  return signature ? `${body}.${signature}` : "";
}

export function validateAdminSessionToken(token: string, nowMs = Date.now()): boolean {
  const parts = String(token || "").split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const expiresAt = Number(parts[1]);
  const nonce = parts[2] || "";
  const suppliedSignature = parts[3] || "";
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs || expiresAt > nowMs + SESSION_TTL_SECONDS * 1000) return false;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(nonce)) return false;
  const expectedSignature = sign(`v1.${expiresAt}.${nonce}`);
  return Boolean(expectedSignature) && timingSafeStringEqual(suppliedSignature, expectedSignature);
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
