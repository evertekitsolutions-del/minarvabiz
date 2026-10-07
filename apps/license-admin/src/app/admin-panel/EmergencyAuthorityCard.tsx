"use client";

import * as React from "react";
import { readBrowserAdminSession } from "./browser-admin-session";

const EDGE = "https://minarva-biz-license-edge.minarva-biz.workers.dev";

type Status = { enabled: boolean; currentConfigured: boolean; previousActive: boolean; source: string; updatedAt?: string | null };

async function request(path: string, method = "GET") {
  const session = readBrowserAdminSession();
  if (!session?.accessToken) throw new Error("Named administrator session is required.");
  const response = await fetch(`${EDGE}${path}`, {
    method,
    headers: { accept: "application/json", authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true) {
    const code = String(data?.code || "");
    if (code === "MFA_REQUIRED") throw new Error("AAL2 MFA verification is required.");
    if (code === "FORBIDDEN") throw new Error("Administrator role is required.");
    throw new Error("Emergency authority request failed.");
  }
  return data;
}

export function EmergencyAuthorityCard() {
  const [status, setStatus] = React.useState<Status | null>(null);
  const [credential, setCredential] = React.useState("");
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const refresh = React.useCallback(async () => {
    try {
      const data = await request("/api/admin/emergency/control-status");
      setStatus({
        enabled: Boolean(data.enabled),
        currentConfigured: Boolean(data.currentConfigured),
        previousActive: Boolean(data.previousActive),
        source: String(data.source || ""),
        updatedAt: data.updatedAt || null,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Emergency authority status failed.");
    }
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);

  async function rotate() {
    if (credential && !acknowledged) return;
    if (!window.confirm(status?.currentConfigured
      ? "Rotate the emergency credential? Existing emergency sessions will be revoked."
      : "Create and enable a new emergency break-glass credential?")) return;
    setBusy(true); setMessage(""); setCredential(""); setAcknowledged(false);
    try {
      const data = await request("/api/admin/emergency/rotate", "POST");
      const raw = String(data.credential || "");
      if (!raw) throw new Error("The one-time credential was not returned.");
      setCredential(raw);
      setMessage("Save this credential now. It is shown only once and is not stored in this browser.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Emergency credential rotation failed.");
    } finally { setBusy(false); }
  }

  async function disable() {
    if (credential && !acknowledged) return;
    if (!window.confirm("Disable emergency access and revoke emergency sessions? This removes active emergency credentials.")) return;
    setBusy(true); setMessage("");
    try {
      await request("/api/admin/emergency/disable", "POST");
      setCredential(""); setAcknowledged(false);
      setMessage("Emergency access disabled.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Emergency access disable failed.");
    } finally { setBusy(false); }
  }

  async function copyCredential() {
    if (!credential) return;
    await navigator.clipboard.writeText(credential);
    setMessage("Credential copied. Store it in your secure password manager, then acknowledge below.");
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recovery control</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Emergency break-glass authority</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Named AAL2 administrators can create, rotate, or disable the emergency credential. Raw credentials are never persisted by this page.</p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs font-medium">{status?.enabled ? "Enabled" : "Disabled"}</span>
      </div>
      <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
        <div>Current credential: <strong>{status?.currentConfigured ? "configured" : "none"}</strong></div>
        <div>Previous grace: <strong>{status?.previousActive ? "active" : "none"}</strong></div>
        <div>Authority: <strong>{status?.source || "not initialized"}</strong></div>
      </div>
      {credential && (
        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">One-time emergency credential</p>
          <p className="mt-1 text-xs text-amber-800">Do not screenshot, email, or paste this credential into chat.</p>
          <div className="mt-3 flex gap-2">
            <input readOnly type="password" value={credential} className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 font-mono text-sm" />
            <button type="button" onClick={() => void copyCredential()} className="rounded-lg border bg-white px-3 py-2 text-sm">Copy</button>
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            <span>I saved the credential securely. It may now be dismissed or rotated.</span>
          </label>
          {acknowledged && <button type="button" className="mt-3 text-sm underline" onClick={() => { setCredential(""); setAcknowledged(false); }}>Dismiss credential</button>}
        </div>
      )}
      {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" disabled={busy || Boolean(credential && !acknowledged)} onClick={() => void rotate()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{status?.currentConfigured ? "Rotate credential" : "Create emergency credential"}</button>
        <button type="button" disabled={busy || !status?.enabled || Boolean(credential && !acknowledged)} onClick={() => void disable()} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50">Disable emergency access</button>
        <button type="button" disabled={busy} onClick={() => void refresh()} className="rounded-lg border px-4 py-2 text-sm">Refresh status</button>
      </div>
    </section>
  );
}
