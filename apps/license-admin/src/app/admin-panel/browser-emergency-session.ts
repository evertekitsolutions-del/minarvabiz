"use client";

import type { AdminIdentityView } from "./types";

const STORAGE_KEY = "minarvabiz-license-admin-emergency-v1";

export interface BrowserEmergencyAdminSession {
  sessionToken: string;
  identity: AdminIdentityView;
  expiresAt: string;
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidSession(value: unknown): value is BrowserEmergencyAdminSession {
  if (!value || typeof value !== "object") return false;
  const row = value as BrowserEmergencyAdminSession;
  const expiresAt = Date.parse(String(row.expiresAt || ""));
  return Boolean(
    /^[A-Za-z0-9_-]{64}$/.test(String(row.sessionToken || "")) &&
      row.identity &&
      typeof row.identity.id === "string" &&
      row.identity.id.length >= 1 &&
      row.identity.id.length <= 200 &&
      validEmail(String(row.identity.email || "")) &&
      typeof row.identity.displayName === "string" &&
      row.identity.displayName.trim().length >= 1 &&
      row.identity.displayName.length <= 200 &&
      row.identity.role === "admin" &&
      row.identity.source === "emergency" &&
      Number.isFinite(expiresAt) &&
      expiresAt > Date.now() + 15_000
  );
}

export function persistBrowserEmergencySession(input: BrowserEmergencyAdminSession) {
  if (!isValidSession(input)) return false;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(input));
    return true;
  } catch {
    return false;
  }
}

export function readBrowserEmergencySession(): BrowserEmergencyAdminSession | null {
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

export function clearBrowserEmergencySession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Browser storage may be unavailable; the in-memory caller still signs out.
  }
}

export async function signOutBrowserEmergencySession(edgeOrigin: string) {
  const session = readBrowserEmergencySession();
  clearBrowserEmergencySession();
  if (!session) return;

  try {
    await fetch(`${edgeOrigin}/api/admin/emergency/logout`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${session.sessionToken}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // Local sign-out must still succeed if the emergency authority is unavailable.
  }
}
