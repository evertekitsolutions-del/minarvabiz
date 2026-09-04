"use client";

import * as React from "react";
import type { BackupMeta } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent } from "../Card";

type NativeBackup = BackupMeta;
type NativeDesktopApi = {
  listBackups?: () => Promise<NativeBackup[]>;
  createManualBackup?: () => Promise<{ ok: boolean; error?: string; cancelled?: boolean }>;
  exportBackup?: (id: string) => Promise<{ ok: boolean; error?: string; cancelled?: boolean }>;
  restoreBackup?: () => Promise<{ ok: boolean; error?: string; cancelled?: boolean }>;
  relaunch?: () => Promise<boolean>;
};

function desktopApi(): NativeDesktopApi | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { minarvaDesktop?: NativeDesktopApi }).minarvaDesktop ?? null;
}

export function BackupPanel({
  backups: fallbackBackups,
  onCreate,
  onVerify,
  onDownload,
  onInspect,
  onRestore,
}: {
  backups: BackupMeta[];
  onCreate: () => void | Promise<void>;
  onVerify: (id: string) => boolean | void;
  onDownload: (id: string) => void;
  onInspect: (id: string) => { ok: boolean; summary?: Record<string, number>; error?: string } | void;
  onRestore?: () => void | Promise<void>;
}) {
  const [nativeBackups, setNativeBackups] = React.useState<NativeBackup[] | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const native = desktopApi();

  const refreshNative = React.useCallback(async () => {
    if (!native?.listBackups) return;
    setNativeBackups(await native.listBackups());
  }, [native]);

  React.useEffect(() => { void refreshNative(); }, [refreshNative]);
  const backups = nativeBackups ?? fallbackBackups;

  const run = async (action: () => void | Promise<void>, success: string) => {
    setBusy(true);
    try { await action(); setMessage(success); await refreshNative(); }
    catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const create = async () => {
    if (native?.createManualBackup) {
      const r = await native.createManualBackup();
      if (r.cancelled) return;
      if (!r.ok) throw new Error(r.error || "Backup failed");
      await refreshNative();
      return;
    }
    await onCreate();
  };

  const restore = async () => {
    if (native?.restoreBackup) {
      const r = await native.restoreBackup();
      if (r.cancelled) return;
      if (!r.ok) throw new Error(r.error || "Restore failed");
      setMessage("Restore successful. Restarting Minarva Biz…");
      await native.relaunch?.();
      return;
    }
    if (onRestore) await onRestore();
    else throw new Error("Restore is available in the desktop edition only");
  };

  const download = async (id: string) => {
    if (native?.exportBackup) {
      const r = await native.exportBackup(id);
      if (r.cancelled) return;
      setMessage(r.ok ? "Backup saved" : r.error || "Backup export failed");
      return;
    }
    onDownload(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Backup & Restore</h2>
          <p className="text-sm text-slate-500">Full local SQLite backups with a safety backup before restore</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void run(restore, "Restore completed")}>Restore backup</Button>
          <Button disabled={busy} onClick={() => void run(create, "Backup created")}>Create backup</Button>
        </div>
      </div>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      <div className="space-y-2">
        {backups.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center text-slate-400">No backups yet</p>}
        {backups.map((b) => (
          <Card key={b.id}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium text-slate-900">{b.filename}</div>
                <div className="text-xs text-slate-500">{new Date(b.createdAt).toLocaleString("en-IN")} · {(b.sizeBytes / 1024).toFixed(1)} KB · {b.kind} · {b.verified ? "verified" : "unverified"}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => { const ok = onVerify(b.id); setMessage(ok === undefined ? "Backup verification completed" : ok ? "Backup verified OK" : "Verification failed"); }}>Verify</Button>
                <Button size="sm" variant="outline" onClick={() => { const r = onInspect(b.id); setMessage(r === undefined ? "Backup inspection completed" : r.ok ? `Contains: ${Object.entries(r.summary || {}).map(([k, v]) => `${k}=${v}`).join(", ")}` : r.error || "Invalid"); }}>Inspect</Button>
                <Button size="sm" onClick={() => void download(b.id)}>Download</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
