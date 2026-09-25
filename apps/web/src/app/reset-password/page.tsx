"use client";

import * as React from "react";
import { Button } from "@minarvabiz/ui";
import { updatePasswordFromRecovery } from "@/lib/data-source";

function readRecoveryToken(): string {
  if (typeof window === "undefined") return "";

  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const query = new URLSearchParams(url.search);
  const token = hash.get("access_token") || query.get("access_token") || "";

  for (const key of ["access_token", "refresh_token", "provider_token", "provider_refresh_token"]) {
    hash.delete(key);
    query.delete(key);
  }

  const sanitizedSearch = query.toString();
  const sanitizedHash = hash.toString();
  const sanitized =
    url.pathname +
    (sanitizedSearch ? `?${sanitizedSearch}` : "") +
    (sanitizedHash ? `#${sanitizedHash}` : "");
  window.history.replaceState(null, "", sanitized);

  return token;
}

export default function ResetPasswordPage() {
  const [token, setToken] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => { setToken(readRecoveryToken()); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMessage(null);
    if (password.length < 8) { setError("Password must contain at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    const result = await updatePasswordFromRecovery(token, password);
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    setMessage("Password updated successfully. You can now sign in with the new password.");
    setPassword(""); setConfirm("");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-900">Choose a new password</h1>
          <p className="mt-1 text-sm text-slate-500">Use the recovery link from your email.</p>
        </div>
        {!token && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This recovery link is missing its access token or has expired. Request a new reset email.</p>}
        <label className="block text-sm"><span className="text-slate-600">New password</span><input type="password" minLength={8} autoComplete="new-password" required className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label className="block text-sm"><span className="text-slate-600">Confirm password</span><input type="password" minLength={8} autoComplete="new-password" required className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        {message && <p className="text-sm text-emerald-700">{message}</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading || !token}>{loading ? "Updating…" : "Update password"}</Button>
        <div className="text-center"><a href="/login" className="text-sm font-medium text-indigo-600 hover:underline">Back to sign in</a></div>
      </form>
    </main>
  );
}
