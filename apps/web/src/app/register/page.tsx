"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { signupDisposition, signupErrorMessage } from "@/lib/registration-status";

const PLAN_CODES = ["starter", "business-pro", "business-web", "business-360"] as const;
type PlanCode = typeof PLAN_CODES[number];

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = React.useState("");
  const [shopName, setShopName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [plan, setPlan] = React.useState<PlanCode>("starter");
  const [partnerCode,setPartnerCode]=React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const submitting = React.useRef(false);

  React.useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("plan");
    if (PLAN_CODES.some(code => code === requested)) setPlan(requested as PlanCode);
    const code=new URLSearchParams(window.location.search).get("ref")?.toUpperCase()||"";
    if(/^[A-Z0-9]{6,16}$/.test(code))setPartnerCode(code);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    if (!supabase) {
      setError("Online registration is not configured. Contact Minarva Biz support.");
      return;
    }
    const name = fullName.trim();
    const business = shopName.trim();
    if (name.length < 2 || name.length > 120 || business.length < 3 || business.length > 120) {
      setError("Enter a valid name and business name (maximum 120 characters).");
      return;
    }
    if(partnerCode.trim()&&!/^[A-Z0-9]{6,16}$/.test(partnerCode.trim().toUpperCase())){
      setError("Referral partner code must be 6–16 letters or numbers.");return;
    }
    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo: /^(www\.)?minarvabiz\.com$/i.test(window.location.hostname)
            ? "https://minarvabiz.com/register/complete"
            : window.location.origin + "/register/complete",
          data: { full_name: name, shop_name: business, requested_plan: plan,
           requested_partner_code: partnerCode.trim().toUpperCase() || null },
        },
      });
      if (authError) throw authError;
      // A plan request in user metadata is NOT a subscription entitlement.
      const disposition = signupDisposition(data);
      if (disposition === "signed_in") {
        router.replace("/register/complete");
      } else {
        // Supabase returns 200 for some repeated signups without creating a user
        // or sending email. Never promise mail delivery from a 200 response.
        setSent(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? signupErrorMessage(cause) : "Registration failed. Please retry.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <a className="text-sm font-bold text-blue-700" href="/">Minarva Biz</a>
      <h1 className="mt-4 text-2xl font-bold">Create your business account</h1>
      {sent ? <section aria-live="polite" className="mt-6 space-y-4 text-sm">
        <p>Request received. If this is a new account, follow the verification link when it arrives. If you have registered with this email before, no new verification email may be sent: sign in using your <strong>original password</strong>. The password entered on a repeated signup does not replace it.</p>
        <p>If verification email is missing, do not keep registering; contact Minarva Biz support to check email delivery.</p>
        <div className="flex flex-wrap gap-3">
          <a href="/login" className="rounded-lg border border-slate-300 px-4 py-3 font-semibold">Sign in to existing account</a>
          <a href="/forgot-password" className="rounded-lg border border-slate-300 px-4 py-3 font-semibold">Forgot original password?</a>
        </div>
        <a href="/register/complete" className="inline-flex rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white">Complete verified registration</a>
      </section> : <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-sm font-medium">Your name<input className="mt-1 w-full rounded-lg border border-slate-300 p-3" autoComplete="name" required minLength={2} maxLength={120} value={fullName} onChange={e => setFullName(e.target.value)} /></label>
        <label className="block text-sm font-medium">Business name<input className="mt-1 w-full rounded-lg border border-slate-300 p-3" required minLength={3} maxLength={120} value={shopName} onChange={e => setShopName(e.target.value)} /></label>
        <label className="block text-sm font-medium">Email<input className="mt-1 w-full rounded-lg border border-slate-300 p-3" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="block text-sm font-medium">Password<input className="mt-1 w-full rounded-lg border border-slate-300 p-3" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <label className="block text-sm font-medium">Requested plan<select className="mt-1 w-full rounded-lg border border-slate-300 p-3" value={plan} onChange={e => setPlan(e.target.value as PlanCode)}>
          <option value="starter">Starter</option><option value="business-pro">Business Pro</option><option value="business-web">Business Web</option><option value="business-360">Business 360</option>
        </select></label>
        <label className="block text-sm font-medium">Referral code (optional)
         <input className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 p-3"
          value={partnerCode} maxLength={16} autoComplete="off"
          placeholder="Partner code" onChange={e=>setPartnerCode(e.target.value.toUpperCase())}/></label>
        <p className="text-xs font-semibold text-blue-800">30-day free trial starts after verified email and tenant onboarding.</p>
        <p className="text-xs text-slate-600">Registration is free. Choosing a plan only records your request; it does not activate a paid subscription or charge you. Access is subject to verification and activation.</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60">{busy ? "Registering…" : "Register and verify email"}</button>
      </form>}
      <p className="mt-5 text-sm">Already registered? <a className="font-semibold text-blue-700 underline" href="/login">Sign in</a></p>
    </div>
  </main>;
}
