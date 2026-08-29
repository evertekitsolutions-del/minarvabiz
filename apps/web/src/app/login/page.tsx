"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@minarvabiz/ui";
import { ensureDefaultAdmin, login } from "@minarvabiz/database";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("admin@minarvabiz.local");
  const [password, setPassword] = React.useState("ChangeMeNow1!");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    ensureDefaultAdmin().catch(() => undefined);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await login(email, password);
      if (result.error || !result.session) {
        setError(result.error || "Login failed");
        return;
      }
      if (typeof window !== "undefined") {
        sessionStorage.setItem("minarva_session", result.session.token);
        sessionStorage.setItem("minarva_user", JSON.stringify({
          id: result.user!.id,
          email: result.user!.email,
          fullName: result.user!.fullName,
          role: result.user!.role,
        }));
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-900">Minarva Biz</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to continue</p>
        </div>
        <label className="block text-sm">
          <span className="text-slate-600">Email</span>
          <input
            type="email"
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Password</span>
          <input
            type="password"
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-center text-[11px] text-slate-400">
          Default offline admin: admin@minarvabiz.local / ChangeMeNow1!
        </p>
      </form>
    </main>
  );
}
