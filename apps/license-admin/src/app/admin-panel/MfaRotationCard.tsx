"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
import {
  beginBrowserAdminMfaEnrollment,
  listBrowserAdminMfaFactors,
  unenrollBrowserAdminMfaFactor,
  verifyBrowserAdminMfa,
  type BrowserAdminPendingAuth,
  type BrowserAdminMfaFactor,
} from "./browser-admin-auth.ts";

export function MfaRotationCard({ accessToken, userId }: { accessToken: string; userId: string }) {
  const [factors, setFactors] = React.useState<BrowserAdminMfaFactor[]>([]);
  const [pending, setPending] = React.useState<BrowserAdminPendingAuth | null>(null);
  const [secret, setSecret] = React.useState("");
  const [qr, setQr] = React.useState("");
  const [code, setCode] = React.useState("");
  const [replacementVerified, setReplacementVerified] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const result = await listBrowserAdminMfaFactors(accessToken);
    if (result.ok) setFactors(result.factors);
    else setMessage(result.error);
  }, [accessToken]);

  React.useEffect(() => { void refresh(); }, [refresh]);

  async function enrollReplacement() {
    setBusy(true); setMessage(null);
    const result = await beginBrowserAdminMfaEnrollment({
      config: { supabaseUrl: "", supabasePublishableKey: "", passwordResetUrl: "" },
      accessToken, userId, mode: "challenge",
    });
    setBusy(false);
    if (!result.ok) { setMessage(result.error); return; }
    setPending(result.pending); setSecret(result.secret); setQr(result.qrCode);
    setReplacementVerified(false);
    setMessage("Scan the replacement authenticator, then verify its current code. Do not remove the old factor first.");
  }

  async function verifyReplacement() {
    setBusy(true); setMessage(null);
    const result = await verifyBrowserAdminMfa(pending, code);
    setBusy(false);
    if (!result.ok) { setMessage(result.error); return; }
    setSecret(""); setQr(""); setCode(""); setPending(null); setReplacementVerified(true);
    setMessage("Replacement authenticator verified. You may now remove the old factor.");
    await refresh();
  }

  async function removeFactor(id: string) {
    if (!replacementVerified) { setMessage("Verify a replacement authenticator in this session before removing an old factor."); return; }
    if (!window.confirm("Remove this old authenticator? The verified replacement will remain active.")) return;
    setBusy(true); setMessage(null);
    const result = await unenrollBrowserAdminMfaFactor(accessToken, id);
    setBusy(false); setMessage(result.ok ? "Old authenticator removed." : result.error);
    if (result.ok) await refresh();
  }

  return <Card>
    <CardHeader><CardTitle>Authenticator security</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-slate-600">Rotate TOTP safely by enrolling and verifying a replacement before removing an old authenticator.</p>
      <Button variant="outline" disabled={busy || Boolean(pending)} onClick={() => void enrollReplacement()}>
        {busy ? "Working…" : "Enroll replacement authenticator"}
      </Button>
      {qr.startsWith("data:image/") && <img src={qr} alt="Replacement authenticator QR code" className="max-h-56 max-w-56 rounded-lg border p-2" />}
      {secret && <div className="rounded-lg border p-3"><p className="text-xs text-slate-500">Manual replacement secret</p><code className="break-all text-xs">{secret}</code></div>}
      {pending && <div className="flex gap-2"><input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e)=>setCode(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="Authenticator code" className="h-10 rounded-lg border px-3 text-sm" /><Button disabled={busy || code.length < 6} onClick={() => void verifyReplacement()}>Verify replacement</Button></div>}
      <div className="space-y-2">{factors.filter(f=>f.status==="verified").map((factor,index)=><div key={factor.id} className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm">Verified authenticator {index+1}</span><Button variant="outline" disabled={busy || !replacementVerified || factors.filter(f=>f.status==="verified").length <= 1} onClick={()=>void removeFactor(factor.id)}>Remove old factor</Button></div>)}</div>
      {message && <p className="text-sm text-slate-700">{message}</p>}
    </CardContent>
  </Card>;
}
