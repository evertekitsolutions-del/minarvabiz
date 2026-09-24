import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "minarva-license-admin";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function sessionSecret(): string {
  const value = String(process.env.LICENSE_SESSION_SECRET || "").trim();
  return value.length >= 32 ? value : "";
}

export function adminPassword(): string {
  return String(process.env.LICENSE_API_SECRET || "").trim();
}

export function timingSafeStringEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
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
