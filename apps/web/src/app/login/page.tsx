"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@minarvabiz/ui";
import { createInitialAdmin, hasLocalUsers, isSupabaseConfigured, login } from "@minarvabiz/database";
import { getRuntimeMode, setSession } from "@minarvabiz/business-logic";
import { supabaseLogin } from "@/lib/data-source";

export default function LoginPage() {
  const router = useRouter();
  const [setup, setSetup] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const local = !isSupabaseConfigured() && getRuntimeMode() !== "demo";
    setSetup(local && !hasLocalUsers());
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (setup) {
        const result = await createInitialAdmin({ email, fullName, password });
        if (result.error || !result.user) {
          setError(result.error || "Unable to create administrator");
          return;
        }
        setSetup(false);
        setSession((await login(email, password)).session!.token, {
          id: result.user.id, email: result.user.email, fullName: result.user.fullName, role: result.user.role,
        });
        router.push("/dashboard");
        return;
      }

      if (isSupabaseConfigured()) {
        const remote = await supabaseLogin(email, password);
        if (!remote.ok) { setError(remote.error || "Supabase login failed"); return; }
        setSession(remote.token, {
          id: remote.user.id,
          email: remote.user.email || email,
          fullName: remote.user.email || email,
          role: "admin",
        });
        router.push("/dashboard");
        return;
      }

      const result = await login(email, password);
      if (result.error || !result.session || !result.user) {
        setError(result.error || "Login failed");
        return;
      }
      setSession(result.session.token, {
        id: result.user.id, email: result.user.email, fullName: result.user.fullName, role: result.user.role,
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-900">Minarva Biz</h1>
          <p className="mt-1 text-sm text-slate-500">{setup ? "Create the first administrator" : "Sign in to continue"}</p>
        </div>
        {setup && <label className="block text-sm"><span className="text-slate-600">Full name</span><input className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={fullName} onChange={e => setFullName(e.target.value)} required /></label>}
        <label className="block text-sm"><span className="text-slate-600">Email</span><input type="email" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label className="block text-sm"><span className="text-slate-600">Password</span><input type="password" minLength={8} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>{loading ? "Please wait…" : setup ? "Create Administrator" : "Sign in"}</Button>
        {setup && <p className="text-center text-[11px] text-slate-400">No default password is shipped. Choose your administrator credentials now.</p>}
      </form>
    </main>
  );
}
