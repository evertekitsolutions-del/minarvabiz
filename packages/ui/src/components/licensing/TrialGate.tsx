import * as React from "react";

export type TrialRegistration = {
  email: string;
  phone: string;
  organizationName: string;
  address: string;
};

export type TrialState = {
  activated: boolean;
  status: "unactivated" | "active" | "expired" | "invalid_clock";
  daysRemaining: number;
  trialStartedAt: string | null;
  trialExpiresAt: string | null;
  registration: TrialRegistration | null;
  synced: boolean;
};

type Props = {
  state: TrialState | null;
  onActivate: (registration: TrialRegistration) => Promise<{ ok: boolean; error?: string }>;
};

export function TrialGate({ state, onActivate }: Props) {
  const [form, setForm] = React.useState<TrialRegistration>({ email: "", phone: "", organizationName: "", address: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (state?.status === "active") {
    return <div className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-2xl rounded-2xl border border-emerald-200 bg-white p-8 shadow-sm"><div className="text-sm font-semibold text-emerald-700">MINARVA BIZ TRIAL ACTIVE</div><h1 className="mt-2 text-3xl font-bold text-slate-900">Welcome to Minarva Biz</h1><p className="mt-2 text-slate-600">All features are unlocked for your 30-day trial.</p><p className="mt-4 text-lg font-semibold text-slate-900">{state.daysRemaining} day{state.daysRemaining === 1 ? "" : "s"} remaining</p>{state.registration && <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><div className="font-medium text-slate-900">Registered organization</div><div>{state.registration.organizationName}</div><div>{state.registration.email} · {state.registration.phone}</div></div>}</div></div>;
  }

  if (state?.status === "expired") {
    return <div className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-2xl rounded-2xl border border-amber-200 bg-white p-8 shadow-sm"><div className="text-sm font-semibold text-amber-700">TRIAL ENDED</div><h1 className="mt-2 text-3xl font-bold text-slate-900">Your Minarva Biz trial has ended</h1><p className="mt-2 text-slate-600">Please contact Minarva Technologies to activate a commercial license.</p></div></div>;
  }

  if (state?.status === "invalid_clock") {
    return <div className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-2xl rounded-2xl border border-rose-200 bg-white p-8 shadow-sm"><div className="text-sm font-semibold text-rose-700">SYSTEM TIME CHECK FAILED</div><h1 className="mt-2 text-3xl font-bold text-slate-900">Please correct the Windows date and time</h1><p className="mt-2 text-slate-600">Minarva Biz detected that the system clock was moved backwards. Correct the Windows date/time and restart the application.</p></div></div>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.email.trim() || !form.phone.trim() || !form.organizationName.trim() || !form.address.trim()) { setError("Email, phone number, organization name, and address are required."); return; }
    setBusy(true);
    try { const result = await onActivate({ email: form.email.trim(), phone: form.phone.trim(), organizationName: form.organizationName.trim(), address: form.address.trim() }); if (!result.ok) setError(result.error || "Could not activate the trial."); }
    catch { setError("Could not activate the trial. Please try again."); }
    finally { setBusy(false); }
  }

  return <div className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><div className="text-sm font-semibold text-blue-700">MINARVA BIZ · 30-DAY FREE TRIAL</div><h1 className="mt-2 text-3xl font-bold text-slate-900">Activate your free trial</h1><p className="mt-2 text-slate-600">Enter your business details to unlock all Minarva Biz features for 30 days.</p><form className="mt-7 space-y-4" onSubmit={submit}><label className="block text-sm font-medium text-slate-700">Email address<input type="email" required autoComplete="email" className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label className="block text-sm font-medium text-slate-700">Phone number<input type="tel" required autoComplete="tel" className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label><label className="block text-sm font-medium text-slate-700">Organization / business name<input required className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3" value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} /></label><label className="block text-sm font-medium text-slate-700">Business address<textarea required rows={3} className="mt-1 w-full rounded-lg border border-slate-300 p-3" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>{error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}<button disabled={busy} className="h-11 w-full rounded-lg bg-blue-600 px-4 font-semibold text-white disabled:opacity-60">{busy ? "Activating…" : "Activate 30-Day Trial"}</button></form><p className="mt-5 text-xs leading-5 text-slate-500">Your registration details are used for trial licensing and support. When internet is available, Minarva Biz securely sends the registration to the Minarva Technologies licensing service.</p></div></div>;
}
