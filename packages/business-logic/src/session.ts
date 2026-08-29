/**
 * Client session helpers — shared by web and desktop shells.
 */

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
}

export function clearSession() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getSessionToken() && getSessionUser());
}
