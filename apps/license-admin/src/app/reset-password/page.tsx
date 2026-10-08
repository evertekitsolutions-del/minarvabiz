"use client";

import * as React from "react";
import { licenseEdgeOrigin } from "../admin-panel/license-edge-config.ts";

const EDGE = licenseEdgeOrigin();

type AuthConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

function takeRecoveryAccessToken() {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const type = hash.get("type") || url.searchParams.get("type") || "";
  const accessToken =
    type === "recovery" ? hash.get("access_token") || url.searchParams.get("access_token") || "" : "";

  // Recovery credentials are bearer secrets. Capture the access token in memory and
  // scrub every auth secret from the address bar/history before the user can interact.
  for (const key of ["access_token", "refresh_token", "expires_in", "expires_at", "token_type"]) {
    url.searchParams.delete(key);
    hash.delete(key);
  }
  if (type === "recovery") {
    url.searchParams.set("type", "recovery");
  }
  url.hash = hash.toString() ? `#${hash.toString()}` : "";
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return accessToken;
}

export default function ResetPasswordPage() {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [accessToken, setAccessToken] = React.useState("");

  React.useEffect(() => {
    setAccessToken(takeRecoveryAccessToken());
  }, []);

  async function updatePassword() {
    if (password.length < 12 || password !== confirm) {
      setMessage(password.length < 12 ? "Use at least 12 characters." : "Passwords do not match.");
      return;
    }
    if (!accessToken) {
      setMessage("This password reset link is invalid or expired. Request a new link from License Admin.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const cfgResponse = await fetch(`${EDGE}/api/admin/auth-config`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const cfg = (await cfgResponse.json().catch(() => null)) as
        | (AuthConfig & { passwordResetUrl?: string })
        | null;
      if (!cfgResponse.ok || !cfg?.supabaseUrl?.startsWith("https://") || !cfg?.supabasePublishableKey) {
        throw new Error("config");
      }

      const response = await fetch(`${cfg.supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
        method: "PUT",
        headers: {
          apikey: cfg.supabasePublishableKey,
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ password }),
        cache: "no-store",
      });
      if (!response.ok) {
        setMessage(response.status === 401
          ? "This password reset link is invalid or expired. Request a new link."
          : "Password could not be updated. Try again.");
        return;
      }

      setAccessToken("");
      setPassword("");
      setConfirm("");
      setMessage("Password updated. Return to License Admin and sign in; MFA setup will continue there.");
    } catch {
      setMessage("Administrator authentication is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Set administrator password</h1>
        <p className="mt-2 text-sm text-slate-500">
          Choose a new password for the named License Admin account. Recovery credentials are not stored.
        </p>
        <div className="mt-6 space-y-3">
          <input type="password" autoComplete="new-password" minLength={12} maxLength={2048}
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <input type="password" autoComplete="new-password" minLength={12} maxLength={2048}
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void updatePassword(); }} />
          {message && <p className="text-sm text-slate-600">{message}</p>}
          <button type="button" disabled={busy || !accessToken || !password || !confirm}
            className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void updatePassword()}>
            {busy ? "Updating…" : "Update password"}
          </button>
        </div>
      </div>
    </main>
  );
}
