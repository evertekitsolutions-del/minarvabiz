"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/**
 * Supports link templates using /auth/confirm?token_hash=...&type=email and
 * PKCE callbacks, without elevating a user or bypassing verified email.
 */
export default function ConfirmEmailPage() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    void (async () => {
      try {
        if (!supabase) throw new Error("Online verification is not configured.");
        const url = new URL(window.location.href);
        const tokenHash = url.searchParams.get("token_hash");
        const code = url.searchParams.get("code");
        if (tokenHash) {
          const kind = url.searchParams.get("type");
          if (kind !== "email" && kind !== "signup") {
            throw new Error("Unsupported verification link type.");
          }
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "email",
          });
          if (verifyError) throw verifyError;
        } else if (code) {
          // getSession may have already consumed the PKCE code on initialization.
          const existing = await supabase.auth.getSession();
          if (existing.error) throw existing.error;
          if (!existing.data.session) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) throw exchangeError;
          }
        } else {
          // Implicit-flow links are processed by the Supabase JS client.
          const { error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;
        }
        const { data, error: userError } = await supabase.auth.getUser();
        if (userError || !data.user?.email_confirmed_at) {
          throw new Error("The link has not verified this email. Request a new verification email from support.");
        }
        if (live) router.replace("/register/complete");
      } catch (cause) {
        if (live) setError(cause instanceof Error ? cause.message : "Verification could not be completed.");
      }
    })();
    return () => { live = false; };
  }, [router]);

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 text-slate-900">
    <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-xl font-bold">Confirm email</h1>
      {error ? <>
        <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>
        <a className="mt-4 inline-block text-sm font-semibold text-blue-700 underline" href="/register/complete">Return to registration</a>
      </> : <p role="status" className="mt-4 text-sm">Checking your verification link…</p>}
    </section>
  </main>;
}
