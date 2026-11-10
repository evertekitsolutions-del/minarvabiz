"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase";
import { tenantLoginHref } from "@/lib/tenant-login-link";

export default function CompleteRegistrationPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [needsLogin, setNeedsLogin] = React.useState(false);
  const [link, setLink] = React.useState<string | null>(null);
  const [trialEnds,setTrialEnds]=React.useState<string|null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(true);
  const inFlight = React.useRef(false);

  const findVerifiedTenant = React.useCallback(async () => {
    if (!supabase) throw new Error("Supabase is not configured for online registration.");
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
      setNeedsLogin(true);
      return;
    }
    if (!userData.user.email_confirmed_at) {
      throw new Error("Confirm your email address before accessing the business account.");
    }
    // Server-created memberships are authoritative. Never read organization IDs
    // from editable localStorage, URL arguments or user_metadata.
    const { data, error: membershipError } = await supabase.from("organization_members")
      .select("org_id").eq("user_id", userData.user.id).limit(2);
    if (membershipError) throw membershipError;
    if (!data || data.length !== 1 || typeof data[0].org_id !== "string") {
      throw new Error("Business membership is not ready. Contact support; do not register another account.");
    }
    // Metadata only expresses a user-selected plan/referral code. The RPC derives
    // tenant authorization from the verified JWT + DB membership and prices from the catalog.
    const requested=userData.user.user_metadata?.requested_plan;
    const mapping:Record<string,string>={
      starter:"base","business-pro":"growth","business-web":"website",
      "business-360":"commerce"
    };
    const requestedCode=typeof requested==="string"?mapping[requested]:"base";
    const rawRef=userData.user.user_metadata?.requested_partner_code;
    const referral=typeof rawRef==="string"&&/^[A-Z0-9]{6,16}$/.test(rawRef)?rawRef:null;
    const {data:trial,error:trialError}=await supabase.rpc("saas_start_tenant_trial_once",{
      p_plan_code:requestedCode||"base",p_partner_code:referral
    });
    if(trialError)throw trialError;
    const receipt=trial as {org_id?:string;trial_ends_at?:string;state?:string}|null;
    if(!receipt||receipt.org_id!==data[0].org_id||!receipt.trial_ends_at)
      throw new Error("Server did not confirm the 30-day tenant trial.");
    setTrialEnds(receipt.trial_ends_at);
    setLink(tenantLoginHref(data[0].org_id));
    setNeedsLogin(false);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Supabase Auth processes the verification redirect and stores its
        // session before getUser. No service-role or custom token is used.
        if (!supabase) throw new Error("Supabase is not configured.");
        await supabase.auth.getSession();
        if (cancelled) return;
        await findVerifiedTenant();
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Registration could not be verified.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [findVerifiedTenant]);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(), password,
      });
      if (signInError) throw signInError;
      await findVerifiedTenant();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify this account.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 text-slate-900">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <a href="/" className="text-sm font-bold text-blue-700">Minarva Biz</a>
      <h1 className="mt-4 text-2xl font-bold">Complete your registration</h1>
      <p className="mt-2 text-sm text-slate-600">Verification and business access are checked against Supabase. Your requested plan is not a paid subscription.</p>
      {busy && <p role="status" className="mt-5 text-sm">Verifying your account…</p>}
      {!busy && link && <div className="mt-6 space-y-4">
        <p className="text-sm">Your business login link is ready. Sign in using your verified email and password.</p>
        {trialEnds&&<p className="text-sm font-semibold text-green-700">30-day trial recorded in Supabase until {new Date(trialEnds).toLocaleDateString()} (server time).</p>}
        <a href={link} className="inline-flex w-full justify-center rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white">Open business login</a>
        <p className="break-all rounded-lg bg-slate-100 p-3 text-xs">{window.location.origin + link}</p>
      </div>}
      {!busy && needsLogin && !link && <form onSubmit={signIn} className="mt-5 space-y-4">
        <p className="text-sm">Enter your verified email and password to retrieve your business login link.</p>
        <label className="block text-sm font-medium">Email<input className="mt-1 w-full rounded-lg border border-slate-300 p-3" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="block text-sm font-medium">Password<input className="mt-1 w-full rounded-lg border border-slate-300 p-3" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button type="submit" className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white">Verify and find my business</button>
      </form>}
      {error && <p role="alert" className="mt-5 text-sm text-red-700">{error}</p>}
      <a href="/login" className="mt-6 inline-block text-sm font-semibold text-blue-700 underline">Existing customer login</a>
    </div>
  </main>;
}
