"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
import { createCommercialLicense, loginAdmin, logoutAdmin, setLicenseStatus } from "./actions";
import type { LicensePlan, Edition } from "@minarvabiz/types";

const PLANS: LicensePlan[] = ["trial", "basic", "professional", "business", "enterprise"];
const EDITIONS: Edition[] = ["online", "offline", "hybrid"];
type LicenseRow = any;

export default function AdminPanel({ authenticated, initialLicenses }: { authenticated: boolean; initialLicenses: LicenseRow[] }) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [customerName, setCustomerName] = React.useState("");
  const [plan, setPlan] = React.useState<LicensePlan>("professional");
  const [edition, setEdition] = React.useState<Edition>("hybrid");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [activationLimit, setActivationLimit] = React.useState("");
  const [lastToken, setLastToken] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function login() { setBusy(true); setMessage(null); const result = await loginAdmin(password); setBusy(false); if (!result.ok) { setMessage(result.error || "Login failed"); return; } setPassword(""); router.refresh(); }
  async function issue() {
    if (!customerName.trim()) { setMessage("Customer name is required."); return; }
    setBusy(true); setMessage(null);
    const result = await createCommercialLicense({ customerName, plan, edition, expiresAt: expiresAt || null, activationLimit: activationLimit ? Number(activationLimit) : undefined });
    setBusy(false); if (!result.ok) { setMessage(result.error || "License issuance failed"); return; }
    setLastToken(result.token || null); setCustomerName(""); router.refresh();
  }
  async function status(licenseId: string, value: "active" | "suspended" | "revoked" | "deactivated") {
    setBusy(true); setMessage(null); const result = await setLicenseStatus(licenseId, value); setBusy(false); if (!result.ok) { setMessage(result.error || "Status update failed"); return; } router.refresh();
  }

  if (!authenticated) return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <Card className="mx-auto mt-20 max-w-md"><CardHeader><CardTitle>Minarva Biz — License Admin</CardTitle></CardHeader><CardContent className="space-y-4">
        <p className="text-sm text-slate-500">Sign in with the server-side license admin credential.</p>
        <input type="password" autoComplete="current-password" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" placeholder="Admin credential" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void login(); }} />
        {message && <p className="text-sm text-rose-600">{message}</p>}
        <Button disabled={busy || !password} onClick={() => void login()}>{busy ? "Signing in…" : "Sign in"}</Button>
      </CardContent></Card>
    </main>
  );

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Minarva Biz — License Admin</h1><p className="mt-1 text-sm text-slate-500">Production license registry · Ed25519 signing · device activation lifecycle</p></div><Button variant="outline" onClick={async () => { await logoutAdmin(); router.refresh(); }}>Sign out</Button></div>
        <div className="grid gap-6 md:grid-cols-2">
          <Card><CardHeader><CardTitle className="text-base">Issue commercial license</CardTitle></CardHeader><CardContent className="space-y-3">
            <input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" placeholder="Customer / organization name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            <div className="grid grid-cols-2 gap-3"><select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={plan} onChange={(e) => setPlan(e.target.value as LicensePlan)}>{PLANS.map((x) => <option key={x}>{x}</option>)}</select><select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={edition} onChange={(e) => setEdition(e.target.value as Edition)}>{EDITIONS.map((x) => <option key={x}>{x}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-3"><input type="datetime-local" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /><input type="number" min="1" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Activation limit" value={activationLimit} onChange={(e) => setActivationLimit(e.target.value)} /></div>
            {message && <p className="text-sm text-rose-600">{message}</p>}<Button disabled={busy} onClick={() => void issue()}>{busy ? "Working…" : "Issue license"}</Button>
            {lastToken && <div className="space-y-1"><p className="text-xs font-medium text-slate-600">New signed license token — copy/save this securely:</p><textarea readOnly className="min-h-28 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-xs" value={lastToken} /></div>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Registry summary</CardTitle></CardHeader><CardContent className="text-sm text-slate-600"><div>Total licenses: <b>{initialLicenses.length}</b></div><div className="mt-2">Active: <b>{initialLicenses.filter((x) => x.status === "active").length}</b></div><div>Suspended: <b>{initialLicenses.filter((x) => x.status === "suspended").length}</b></div><div>Revoked: <b>{initialLicenses.filter((x) => x.status === "revoked").length}</b></div><p className="mt-4 text-xs text-slate-400">Private signing material and Supabase secret keys remain server-side.</p></CardContent></Card>
        </div>
        <Card><CardHeader><CardTitle className="text-base">License registry</CardTitle></CardHeader><CardContent className="space-y-2">
          {initialLicenses.length === 0 && <p className="text-sm text-slate-400">No commercial licenses issued yet.</p>}
          {initialLicenses.map((item) => { const customer = item.metadata?.customerName || "Unnamed customer"; return <div key={item.license_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-3"><div><div className="font-medium text-slate-900">{customer}</div><div className="text-xs text-slate-500">{item.license_id} · {item.plan} · {item.edition} · {item.status}</div><div className="text-xs text-slate-400">Activations: {item.activations?.filter((a: any) => a.status === "active").length || 0}/{item.activation_limit} · Expires: {item.expires_at ? new Date(item.expires_at).toLocaleString() : "Never"}</div></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void status(item.license_id, "suspended")}>Suspend</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void status(item.license_id, "revoked")}>Revoke</Button><Button size="sm" disabled={busy} onClick={() => void status(item.license_id, "active")}>Activate</Button></div></div>; })}
        </CardContent></Card>
      </div>
    </main>
  );
}
