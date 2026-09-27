"use client";

import * as React from "react";
import type { BackupMeta } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent } from "../Card";

type NativeBackup = BackupMeta;
type NativeDesktopApi = {
  listBackups?: () => Promise<NativeBackup[]>;
  createManualBackup?: () => Promise<{ ok: boolean; error?: string; cancelled?: boolean }>;
  createAutomaticBackup?: (retention?: number) => Promise<{ ok: boolean; error?: string; cancelled?: boolean }>;
  exportBackup?: (id: string) => Promise<{ ok: boolean; error?: string; cancelled?: boolean }>;
  restoreBackup?: () => Promise<{ ok: boolean; preRestoreBackup?: string | null; error?: string; cancelled?: boolean }>;
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
  canManage = true,
  retentionCount = 14,
}: {
  backups: BackupMeta[];
  onCreate?: () => void | Promise<void>;
  onVerify?: (id: string) => boolean | void;
  onDownload?: (id: string) => void;
  onInspect?: (id: string) => { ok: boolean; summary?: Record<string, number>; error?: string } | void;
  onRestore?: () => void | Promise<void>;
  canManage?: boolean;
  retentionCount?: number;
}) {
  const [nativeBackups, setNativeBackups] = React.useState<NativeBackup[] | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const native = desktopApi();

  const refreshNative = React.useCallback(async (): Promise<NativeBackup[] | null> => {
    if (!native?.listBackups) return null;
    try {
      const items = await native.listBackups();
      setNativeBackups(items);
      return items;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return null;
    }
  }, [native]);

  React.useEffect(() => {
    void refreshNative();
  }, [refreshNative]);

  const backups = nativeBackups ?? fallbackBackups;
  const automaticBackups = backups.filter((backup) => backup.kind === "automatic");
  const latestAutomatic = automaticBackups[0] ?? null;
  const latestAutomaticAgeHours = latestAutomatic ? Math.max(0, (Date.now() - new Date(latestAutomatic.createdAt).getTime()) / 3600000) : null;
  const backupHealth = latestAutomaticAgeHours == null ? "No automatic backup yet" : latestAutomaticAgeHours <= 26 ? "Healthy" : latestAutomaticAgeHours <= 48 ? "Needs attention" : "At risk";

  const run = async (action: () => void | Promise<void>, success: string) => {
    setBusy(true);
    try {
      await action();
      setMessage(success);
      await refreshNative();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (native?.createManualBackup) {
      const r = await native.createManualBackup();
      if (r.cancelled) return;
      if (!r.ok) throw new Error(r.error || "Backup failed");
      await refreshNative();
      return;
    }
    await onCreate?.();
  };

  const createAutomatic = async () => {
    if (!native?.createAutomaticBackup) throw new Error("Automatic backup is available in the desktop edition only");
    const r = await native.createAutomaticBackup(retentionCount);
    if (r.cancelled) return;
    if (!r.ok) throw new Error(r.error || "Automatic backup failed");
    await refreshNative();
  };

  const restore = async () => {
    if (!canManage) throw new Error("You do not have permission to restore backups.");
    if (!window.confirm("Restore a backup? Minarva Biz will first create a verified safety backup of the current database, then replace the active database and restart.")) return;
    if (native?.restoreBackup) {
      const r = await native.restoreBackup();
      if (r.cancelled) return;
      if (!r.ok) throw new Error(r.error || "Restore failed");
      setMessage(r.preRestoreBackup
        ? "Restore successful. Verified pre-restore safety backup created. Restarting Minarva Biz…"
        : "Restore successful. Restarting Minarva Biz…");
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
    onDownload?.(id);
  };

  const verify = async (backup: NativeBackup) => {
    if (native?.listBackups) {
      const refreshed = await refreshNative();
      const latest = refreshed?.find((item) => item.id === backup.id) ?? backup;
      setMessage(latest.verified ? "Backup verified: valid Minarva Biz SQLite database" : "Verification failed: invalid, incompatible, or unreadable Minarva Biz backup");
      return;
    }
    const ok = onVerify?.(backup.id);
    setMessage(ok === undefined ? "Backup verification completed" : ok ? "Backup verified OK" : "Verification failed");
  };

  const inspect = async (backup: NativeBackup) => {
    if (native?.listBackups) {
      const refreshed = await refreshNative();
      const latest = refreshed?.find((item) => item.id === backup.id) ?? backup;
      setMessage(`${latest.verified ? "Valid Minarva Biz SQLite backup" : "Invalid or incompatible Minarva Biz backup"} · ${(latest.sizeBytes / 1024).toFixed(1)} KB · ${latest.kind} · ${new Date(latest.createdAt).toLocaleString("en-IN")}`);
      return;
    }
    const result = onInspect?.(backup.id);
    setMessage(result === undefined ? "Backup inspection completed" : result.ok ? `Contains: ${Object.entries(result.summary || {}).map(([k, v]) => `${k}=${v}`).join(", ")}` : result.error || "Invalid");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Backup & Restore</h2>
          <p className="text-sm text-slate-500">Full local SQLite backups with a safety backup before restore</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy || !canManage} onClick={() => void run(restore, "Restore completed")}>Restore backup</Button>
          <Button variant="outline" disabled={busy || !canManage || !native?.createAutomaticBackup} onClick={() => void run(createAutomatic, "Automatic backup created")}>Run automatic backup</Button>
          <Button disabled={busy || !canManage} onClick={() => void run(create, "Backup created")}>Create backup</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">Backup health</div><div className="mt-1 text-lg font-semibold text-slate-900">{backupHealth}</div><div className="text-xs text-slate-500">{latestAutomatic ? `${latestAutomaticAgeHours!.toFixed(1)}h since latest automatic backup` : "Automatic backup will be created by the desktop runtime"}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">Automatic backups</div><div className="mt-1 text-lg font-semibold text-slate-900">{automaticBackups.length}</div><div className="text-xs text-slate-500">Retention is managed by the desktop runtime</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">Stored backups</div><div className="mt-1 text-lg font-semibold text-slate-900">{backups.length}</div><div className="text-xs text-slate-500">{backups.filter((backup) => backup.verified).length} verified SQLite file{backups.filter((backup) => backup.verified).length === 1 ? "" : "s"}</div></CardContent></Card>
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
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void verify(b)}>Verify</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void inspect(b)}>Inspect</Button>
                <Button size="sm" disabled={busy || !canManage} onClick={() => void download(b.id)}>Download</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
