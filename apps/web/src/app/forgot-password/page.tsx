"use client";

import * as React from "react";
import { Button } from "@minarvabiz/ui";
import { requestPasswordReset } from "@/lib/data-source";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null); setMessage(null);
    const redirectTo = `${window.location.origin}/reset-password`;
    const result = await requestPasswordReset(email, redirectTo);
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    setMessage("If this email belongs to an online Minarva Biz account, a password reset link has been sent.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-900">Reset your password</h1>
          <p className="mt-1 text-sm text-slate-500">Enter the email used for your online Minarva Biz account.</p>
        </div>
        <label className="block text-sm">
          <span className="text-slate-600">Email</span>
          <input type="email" autoComplete="email" required className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {message && <p className="text-sm text-emerald-700">{message}</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>{loading ? "Sending…" : "Send reset link"}</Button>
        <div className="text-center"><a href="/login" className="text-sm font-medium text-indigo-600 hover:underline">Back to sign in</a></div>
      </form>
    </main>
  );
}
