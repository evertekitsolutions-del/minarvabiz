"use client";

import * as React from "react";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

const SESSION_KEY = "minarva_session";
const USER_KEY = "minarva_user";

export function getStoredSession(): { token: string; user: SessionUser } | null {
  if (typeof window === "undefined") return null;
  const token = sessionStorage.getItem(SESSION_KEY);
  const raw = sessionStorage.getItem(USER_KEY);
  if (!token || !raw) return null;
  try {
    return { token, user: JSON.parse(raw) as SessionUser };
  } catch {
    return null;
  }
}

export function clearStoredSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(USER_KEY);
}

/**
 * Optional client-side gate. Set requireAuth=true to redirect to /login.
 * Default requireAuth=false so existing demos keep working without login.
 */
export function AuthGate({
  children,
  requireAuth = false,
  loginPath = "/login",
  validateSession,
}: {
  children: React.ReactNode;
  requireAuth?: boolean;
  loginPath?: string;
  validateSession?: (session: { token: string; user: SessionUser }) => boolean | Promise<boolean>;
}) {
  const [ready, setReady] = React.useState(false);
  const [allowed, setAllowed] = React.useState(!requireAuth);

  React.useEffect(() => {
    let cancelled = false;

    async function resolveAccess() {
      if (!requireAuth) {
        if (!cancelled) {
          setAllowed(true);
          setReady(true);
        }
        return;
      }

      const session = getStoredSession();
      let valid = Boolean(session);
      if (session && validateSession) {
        try {
          valid = await validateSession(session);
        } catch {
          valid = false;
        }
      }

      if (cancelled) return;
      if (valid) {
        setAllowed(true);
        setReady(true);
        return;
      }

      clearStoredSession();
      setAllowed(false);
      setReady(true);
      if (typeof window !== "undefined") {
        window.location.replace(loginPath);
      }
    }

    void resolveAccess();
    return () => {
      cancelled = true;
    };
  }, [requireAuth, loginPath, validateSession]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }
  if (!allowed) return null;
  return <>{children}</>;
}
