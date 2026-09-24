"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
import { beginAdminMfaEnrollment, cancelAdminMfa, createCommercialLicense, createOfflineActivationPackage, loginAdmin, loginEmergencyAdmin, logoutAdmin, setLicenseStatus, verifyAdminMfa } from "./actions";
import type { LicensePlan, Edition, LicenseFeatures } from "@minarvabiz/types";

const PLANS: LicensePlan[] = ["trial", "basic", "professional", "business", "enterprise"];
const EDITIONS: Edition[] = ["online", "offline", "hybrid"];
const FEATURE_LABELS: Record<keyof LicenseFeatures, string> = {
  sales: "Billing / Sales", customers: "Customers", inventory: "Inventory", tailoring: "Tailoring",
  orders: "Orders", laundry: "Laundry", reports: "Reports", staff: "Staff", advancedReports: "Advanced reports",
  cloudSync: "Cloud sync", multiUser: "Multi-user", multiBranch: "Multi-branch", apiAccess: "API access",
};
type LicenseRow = any;
type AdminIdentityView = { id: string; email: string; displayName: string; source: "supabase" | "emergency" };

function defaultFeatures(plan: LicensePlan): LicenseFeatures {
  const full: LicenseFeatures = { sales:true, customers:true, inventory:true, tailoring:true, orders:true, laundry:true, reports:true, staff:true, advancedReports:true, cloudSync:true, multiUser:true, multiBranch:true, apiAccess:true };
  const plans: Record<LicensePlan, Partial<LicenseFeatures>> = {
    trial: full, basic: { sales:true, customers:true, inventory:true },
    professional: { sales:true, customers:true, inventory:true, tailoring:true, orders:true, laundry:true, reports:true },
    business: { ...full, multiBranch:false, apiAccess:false }, enterprise: full,
  };
  return Object.fromEntries((Object.keys(full) as (keyof LicenseFeatures)[]).map((key) => [key, Boolean(plans[plan][key])])) as LicenseFeatures;
}

export default function AdminPanel({ identity, initialLicenses }: { identity: AdminIdentityView | null; initialLicenses: LicenseRow[] }) {
  const router = useRouter();
  const [email, setEmail] = React.useState(""); const [password, setPassword] = React.useState(""); const [emergencyPassword, setEmergencyPassword] = React.useState(""); const [customerName, setCustomerName] = React.useState("");
  const [plan, setPlan] = React.useState<LicensePlan>("professional"); const [edition, setEdition] = React.useState<Edition>("hybrid");
  const [expiresAt, setExpiresAt] = React.useState(""); const [activationLimit, setActivationLimit] = React.useState("");
  const [features, setFeatures] = React.useState<LicenseFeatures>(() => defaultFeatures("professional"));
  const [offlineLicenseId, setOfflineLicenseId] = React.useState(""); const [offlineDeviceId, setOfflineDeviceId] = React.useState("");
  const [lastToken, setLastToken] = React.useState<string | null>(null); const [message, setMessage] = React.useState<string | null>(null); const [busy, setBusy] = React.useState(false);
  const [authStage, setAuthStage] = React.useState<"password" | "enroll" | "mfa">("password"); const [mfaCode, setMfaCode] = React.useState(""); const [mfaSecret, setMfaSecret] = React.useState(""); const [mfaQrCode, setMfaQrCode] = React.useState("");
  React.useEffect(() => { setFeatures(defaultFeatures(plan)); }, [plan]);

  async function login() {
    setBusy(true); setMessage(null);
    const result = await loginAdmin(email, password);
    setBusy(false);
    if (!result.ok) { setMessage(result.error || "Login failed"); return; }
    setPassword("");
    setMfaCode("");
    setMfaSecret("");
    setMfaQrCode("");
    if (result.next === "enroll") {
      setAuthStage("enroll");
      setMessage("MFA is required. Set up an authenticator before continuing.");
      return;
    }
    setAuthStage("mfa");
    setMessage("MFA is required. Enter the code from your authenticator.");
  }
  async function beginMfaEnrollment() {
    setBusy(true); setMessage(null);
    const result = await beginAdminMfaEnrollment();
    setBusy(false);
    if (!result.ok) { setMessage(result.error || "MFA setup failed"); return; }
    setMfaSecret(result.secret || "");
    setMfaQrCode(result.qrCode || "");
    setAuthStage("mfa");
    setMessage("Authenticator setup started. Add the account, then enter the current code.");
  }
  async function verifyMfa() {
    setBusy(true); setMessage(null);
    const result = await verifyAdminMfa(mfaCode);
    setBusy(false);
    if (!result.ok) { setMessage(result.error || "MFA verification failed"); return; }
    setEmail(""); setPassword(""); setMfaCode(""); setMfaSecret(""); setMfaQrCode(""); setAuthStage("password");
    router.refresh();
  }
  async function resetMfa() {
    await cancelAdminMfa();
    setAuthStage("password"); setMfaCode(""); setMfaSecret(""); setMfaQrCode(""); setMessage(null);
  }
  async function emergencyLogin() { setBusy(true); setMessage(null); const result = await loginEmergencyAdmin(emergencyPassword); setBusy(false); if (!result.ok) { setMessage(result.error || "Emergency login failed"); return; } setEmergencyPassword(""); router.refresh(); }
  async function issue() {
    if (!customerName.trim()) { setMessage("Customer name is required."); return; }
    setBusy(true); setMessage(null);
    const result = await createCommercialLicense({ customerName, plan, edition, expiresAt: expiresAt || null, activationLimit: activationLimit ? Number(activationLimit) : undefined, featureOverrides: features });
    setBusy(false); if (!result.ok) { setMessage(result.error || "License issuance failed"); return; }
    setLastToken(result.token || null); setCustomerName(""); router.refresh();
  }
  async function status(licenseId: string, value: "active" | "suspended" | "revoked" | "deactivated") { setBusy(true); setMessage(null); const result = await setLicenseStatus(licenseId, value); setBusy(false); if (!result.ok) { setMessage(result.error || "Status update failed"); return; } router.refresh(); }
  async function createOfflinePackage() {
    if (!offlineLicenseId.trim() || !offlineDeviceId.trim()) { setMessage("Enter the license ID and target Windows device ID."); return; }
    setBusy(true); setMessage(null); const result = await createOfflineActivationPackage({ licenseId: offlineLicenseId.trim(), deviceId: offlineDeviceId.trim() }); setBusy(false);
    if (!result.ok) { setMessage(result.error || "Offline activation package creation failed"); return; }
    const blob = new Blob([result.content || ""], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = result.filename || "MinarvaBiz.lic"; anchor.click(); URL.revokeObjectURL(url);
    setMessage(`Offline activation package created for activation ${result.activationId}. Copy the .lic file to the target Windows PC.`); router.refresh();
  }

  if (!identity) return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <Card className="mx-auto mt-16 max-w-md">
        <CardHeader><CardTitle>Minarva Biz — License Admin</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {authStage === "password" && <>
            <p className="text-sm text-slate-500">Sign in with your named administrator account. MFA is required for named administrators.</p>
            <input type="email" autoComplete="username" maxLength={254} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" placeholder="Administrator email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" autoComplete="current-password" maxLength={2048} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void login(); }} />
            {message && <p className="text-sm text-rose-600">{message}</p>}
            <Button disabled={busy || !email.trim() || !password} onClick={() => void login()}>{busy ? "Signing in…" : "Sign in"}</Button>
            <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-xs font-medium text-slate-600">Emergency break-glass access</summary>
              <div className="mt-3 space-y-3">
                <p className="text-xs text-slate-500">Shared-secret access is disabled by default, requires a named emergency actor, and creates only a short revocable session.</p>
                <input type="password" autoComplete="off" maxLength={2048} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" placeholder="Emergency admin credential" value={emergencyPassword} onChange={(e) => setEmergencyPassword(e.target.value)} />
                <Button variant="outline" disabled={busy || !emergencyPassword} onClick={() => void emergencyLogin()}>{busy ? "Checking…" : "Emergency sign in"}</Button>
              </div>
            </details>
          </>}
          {authStage === "enroll" && <>
            <p className="text-sm font-medium text-slate-800">MFA is required.</p>
            <p className="text-sm text-slate-500">No verified authenticator is registered for this administrator. Set up a TOTP authenticator before continuing.</p>
            {message && <p className="text-sm text-rose-600">{message}</p>}
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => void beginMfaEnrollment()}>{busy ? "Preparing…" : "Set up authenticator"}</Button>
              <Button variant="outline" disabled={busy} onClick={() => void resetMfa()}>Cancel</Button>
            </div>
          </>}
          {authStage === "mfa" && <>
            <p className="text-sm font-medium text-slate-800">MFA is required.</p>
            <p className="text-sm text-slate-500">Enter the current time-based code from your authenticator app.</p>
            {mfaQrCode.startsWith("data:image/") && <img src={mfaQrCode} alt="Authenticator enrollment QR code" className="mx-auto max-h-56 max-w-56 rounded-lg border border-slate-200 bg-white p-2" />}
            {mfaSecret && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-500">Manual authenticator secret</p><code className="mt-1 block break-all text-xs text-slate-800">{mfaSecret}</code></div>}
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={10} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" placeholder="Authenticator code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 10))} onKeyDown={(e) => { if (e.key === "Enter" && mfaCode.length >= 6) void verifyMfa(); }} />
            {message && <p className="text-sm text-rose-600">{message}</p>}
            <div className="flex gap-2">
              <Button disabled={busy || mfaCode.length < 6} onClick={() => void verifyMfa()}>{busy ? "Verifying…" : "Verify & sign in"}</Button>
              <Button variant="outline" disabled={busy} onClick={() => void resetMfa()}>Cancel</Button>
            </div>
          </>}
        </CardContent>
      </Card>
    </main>
  );

  const availableKeys = (Object.keys(features) as (keyof LicenseFeatures)[]).filter((key) => features[key]);
  return <main className="min-h-screen bg-slate-50 p-6 md:p-10"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Minarva Biz — License Admin</h1><p className="mt-1 text-sm text-slate-500">Signed in as <b>{identity.displayName}</b> · {identity.email}{identity.source === "emergency" ? " · emergency session" : ""}</p></div><Button variant="outline" onClick={async () => { await logoutAdmin(); router.refresh(); }}>Sign out</Button></div>
    <div className="grid gap-6 md:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-base">Create customer license</CardTitle></CardHeader><CardContent className="space-y-3">
        <input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" placeholder="Customer / organization name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3"><select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={plan} onChange={(e) => setPlan(e.target.value as LicensePlan)}>{PLANS.map((x) => <option key={x}>{x}</option>)}</select><select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={edition} onChange={(e) => setEdition(e.target.value as Edition)}>{EDITIONS.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3"><input type="datetime-local" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /><input type="number" min="1" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" placeholder="PC activation limit" value={activationLimit} onChange={(e) => setActivationLimit(e.target.value)} /></div>
        <div className="rounded-lg border border-slate-200 bg-white p-3"><div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold text-slate-800">Allowed features</p><span className="text-xs text-slate-400">{availableKeys.length} enabled</span></div><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{(Object.keys(features) as (keyof LicenseFeatures)[]).map((key) => <label key={key} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={Boolean(features[key])} onChange={(e) => setFeatures((prev) => ({ ...prev, [key]: e.target.checked }))} />{FEATURE_LABELS[key]}</label>)}</div><p className="mt-2 text-xs text-slate-400">You can remove features from the selected plan. A lower plan feature cannot be added accidentally.</p></div>
        {message && <p className="text-sm text-rose-600">{message}</p>}<Button disabled={busy || !customerName.trim()} onClick={() => void issue()}>{busy ? "Generating…" : "Generate License"}</Button>
        {lastToken && <div className="space-y-1"><p className="text-xs font-medium text-slate-600">Signed license token</p><textarea readOnly className="min-h-28 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-xs" value={lastToken} /></div>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">License summary</CardTitle></CardHeader><CardContent className="text-sm text-slate-600"><div>Total licenses: <b>{initialLicenses.length}</b></div><div className="mt-2">Active: <b>{initialLicenses.filter((x) => x.status === "active").length}</b></div><div>Suspended: <b>{initialLicenses.filter((x) => x.status === "suspended").length}</b></div><div>Revoked: <b>{initialLicenses.filter((x) => x.status === "revoked").length}</b></div><p className="mt-4 text-xs text-slate-400">Private signing keys and Supabase secret keys remain server-side.</p></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-base">Offline activation</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-slate-500">For a Windows PC without internet: enter the license ID and the PC's 64-character device ID, then download the signed .lic package.</p><div className="grid gap-3 md:grid-cols-2"><input className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-mono" placeholder="License ID" value={offlineLicenseId} onChange={(e) => setOfflineLicenseId(e.target.value)} /><input className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-mono" placeholder="Target device ID (64 hex chars)" value={offlineDeviceId} onChange={(e) => setOfflineDeviceId(e.target.value)} /></div><Button disabled={busy} onClick={() => void createOfflinePackage()}>{busy ? "Creating…" : "Create & download .lic"}</Button></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">License registry</CardTitle></CardHeader><CardContent className="space-y-2">{initialLicenses.length === 0 && <p className="text-sm text-slate-400">No commercial licenses issued yet.</p>}{initialLicenses.map((item) => { const customer = item.metadata?.customerName || "Unnamed customer"; const enabled = (Object.keys(item.features || {}) as (keyof LicenseFeatures)[]).filter((key) => item.features?.[key]).map((key) => FEATURE_LABELS[key]).join(", "); return <div key={item.license_id} className="rounded-lg border border-slate-100 bg-white px-3 py-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-medium text-slate-900">{customer}</div><div className="text-xs text-slate-500">{item.license_id} · {item.plan} · {item.edition} · {item.status}</div><div className="text-xs text-slate-400">PCs: {item.activations?.filter((a: any) => a.status === "active").length || 0}/{item.activation_limit} · Expires: {item.expires_at ? new Date(item.expires_at).toLocaleString() : "Never"}</div></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void status(item.license_id, "suspended")}>Suspend</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void status(item.license_id, "revoked")}>Revoke</Button><Button size="sm" disabled={busy} onClick={() => void status(item.license_id, "active")}>Activate</Button></div></div><p className="mt-2 text-xs text-slate-500"><b>Features:</b> {enabled || "None"}</p></div>; })}</CardContent></Card>
  </div></main>;
}
