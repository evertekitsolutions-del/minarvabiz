"use client";

import * as React from "react";

const EDGE = "https://minarva-biz-license-edge.minarva-biz.workers.dev";

type AuthConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

function recoveryTokens() {
  if (typeof window === "undefined") return { accessToken: "", refreshToken: "" };
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const type = hash.get("type") || query.get("type") || "";
  return {
    accessToken: type === "recovery" ? hash.get("access_token") || query.get("access_token") || "" : "",
    refreshToken: type === "recovery" ? hash.get("refresh_token") || query.get("refresh_token") || "" : "",
  };
}

export default function ResetPasswordPage() {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function updatePassword() {
    if (password.length < 12 || password !== confirm) {
      setMessage(password.length < 12 ? "Use at least 12 characters." : "Passwords do not match.");
      return;
    }
    const { accessToken } = recoveryTokens();
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

      // Never persist recovery tokens. Remove them from browser history immediately.
      window.history.replaceState(null, "", "/reset-password");
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
          <button type="button" disabled={busy || !password || !confirm}
            className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void updatePassword()}>
            {busy ? "Updating…" : "Update password"}
          </button>
        </div>
      </div>
    </main>
  );
}
