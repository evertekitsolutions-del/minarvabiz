import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const ADMIN_COOKIE = "minarva-license-admin";
const DEFAULT_SESSION_TTL_SECONDS = 30 * 60;
const MIN_SESSION_TTL_SECONDS = 5 * 60;
const MAX_SESSION_TTL_SECONDS = 60 * 60;
const EMERGENCY_SESSION_TTL_SECONDS = 15 * 60;
export const MIN_EMERGENCY_ADMIN_SECRET_LENGTH = 32;
export const MAX_PREVIOUS_SECRET_GRACE_MS = 24 * 60 * 60 * 1000;

export type AdminIdentitySource = "supabase" | "emergency";
export type AdminRole = "viewer" | "operator" | "admin";
export type AdminIdentity = {
  id: string;
  email: string;
  displayName: string;
  source: AdminIdentitySource;
  role: AdminRole;
};

export type AdminSessionClaims = {
  sessionId: string;
  identity: AdminIdentity;
  expiresAtMs: number;
};


function envSecret(name: string): string {
  return String(process.env[name] || "").trim();
}

function normalizeEmail(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isAdminIdentityRole(value: unknown): value is AdminRole {
  return value === "viewer" || value === "operator" || value === "admin";
}

function normalizeIdentity(identity: AdminIdentity): AdminIdentity | null {
  const id = String(identity?.id || "").trim();
  const email = normalizeEmail(identity?.email || "");
  const displayName = String(identity?.displayName || "").trim();
  const source = identity?.source;
  const role = identity?.role;
  if (!id || id.length > 200) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
  if (!displayName || displayName.length > 120) return null;
  if (source !== "supabase" && source !== "emergency") return null;
  if (!isAdminIdentityRole(role)) return null;
  if (source === "emergency" && role !== "admin") return null;
  return { id, email, displayName, source, role };
}

function sessionSecret(): string {
  const value = envSecret("LICENSE_SESSION_SECRET");
  return value.length >= 32 ? value : "";
}

export function adminSessionTtlSeconds(source: AdminIdentitySource = "supabase"): number {
  const configured = Number.parseInt(envSecret("LICENSE_ADMIN_SESSION_TTL_SECONDS"), 10);
  const base = Number.isFinite(configured)
    ? Math.min(MAX_SESSION_TTL_SECONDS, Math.max(MIN_SESSION_TTL_SECONDS, configured))
    : DEFAULT_SESSION_TTL_SECONDS;
  return source === "emergency" ? Math.min(base, EMERGENCY_SESSION_TTL_SECONDS) : base;
}

export function emergencyAdminLoginEnabled(): boolean {
  return envSecret("LICENSE_ADMIN_EMERGENCY_LOGIN_ENABLED").toLowerCase() === "true";
}

export function emergencyAdminIdentity(): AdminIdentity | null {
  const email = normalizeEmail(envSecret("LICENSE_ADMIN_EMERGENCY_ACTOR_EMAIL"));
  const displayName = envSecret("LICENSE_ADMIN_EMERGENCY_ACTOR_NAME");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
  if (!displayName || displayName.length > 120) return null;
  const digest = createHash("sha256").update(email, "utf8").digest("hex").slice(0, 32);
  return { id: `emergency:${digest}`, email, displayName, source: "emergency", role: "admin" };
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
    actorConfigured: Boolean(emergencyAdminIdentity()),
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

export function createAdminSessionToken(
  identity: AdminIdentity,
  sessionId: string,
  expiresAtMs: number,
  nowMs = Date.now(),
): string {
  const normalized = normalizeIdentity(identity);
  if (!normalized || !sessionSecret() || !validUuid(sessionId)) return "";
  const ttlMs = adminSessionTtlSeconds(normalized.source) * 1000;
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs || expiresAtMs > nowMs + ttlMs) return "";
  const nonce = randomBytes(32).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sessionId, identity: normalized }), "utf8").toString("base64url");
  const body = `v3.${expiresAtMs}.${nonce}.${payload}`;
  const signature = sign(body);
  return signature ? `${body}.${signature}` : "";
}

export function readAdminSessionToken(token: string, nowMs = Date.now()): AdminSessionClaims | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 5 || parts[0] !== "v3") return null;
  const expiresAtMs = Number(parts[1]);
  const nonce = parts[2] || "";
  const payload = parts[3] || "";
  const suppliedSignature = parts[4] || "";
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs || expiresAtMs > nowMs + MAX_SESSION_TTL_SECONDS * 1000) return null;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(nonce)) return null;
  if (!payload || payload.length > 4096) return null;
  const body = `v3.${expiresAtMs}.${nonce}.${payload}`;
  const expectedSignature = sign(body);
  if (!expectedSignature || !timingSafeStringEqual(suppliedSignature, expectedSignature)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sessionId?: string;
      identity?: AdminIdentity;
    };
    const identity = normalizeIdentity(parsed.identity as AdminIdentity);
    const sessionId = String(parsed.sessionId || "");
    if (!identity || !validUuid(sessionId)) return null;
    if (expiresAtMs > nowMs + adminSessionTtlSeconds(identity.source) * 1000) return null;
    return { sessionId, identity, expiresAtMs };
  } catch {
    return null;
  }
}

export function validateAdminSessionToken(token: string, nowMs = Date.now()): boolean {
  return Boolean(readAdminSessionToken(token, nowMs));
}

export function adminCookieOptions(source: AdminIdentitySource = "supabase") {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: adminSessionTtlSeconds(source),
  };
}
