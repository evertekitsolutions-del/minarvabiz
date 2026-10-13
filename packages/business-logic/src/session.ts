/**
 * Client session helpers — shared by web and desktop shells.
 */

import { setCurrentRole } from "./permissions";
import { setOutboxScope } from "./outbox-bridge";
import { registerRemoteWriter } from "./remote-write";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

const SESSION_KEY = "minarva_session";
const USER_KEY = "minarva_user";

export function getSessionToken(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(SESSION_KEY);
}

export function getSessionUser(): SessionUser | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: SessionUser) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  setCurrentRole(user.role as Parameters<typeof setCurrentRole>[0]);
}

export function clearSession() {
  // Auth revocation must also revoke any writer capable of replaying queued
  // business records. Retain the queue for later verified owner recovery.
  registerRemoteWriter(null);
  setOutboxScope(null);
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(USER_KEY);
  // Force a fresh role resolution after logout; unauthenticated state has no permissions.
  setCurrentRole(null);
}

export function isAuthenticated(): boolean {
  return Boolean(getSessionToken() && getSessionUser());
}
