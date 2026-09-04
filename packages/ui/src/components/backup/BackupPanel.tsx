"use client";

import * as React from "react";
import type { BackupMeta } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent } from "../Card";

export function BackupPanel({
  backups,
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
  onRestore: () => void | Promise<void>;
}) {
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const run = async (action: () => void | Promise<void>, success: string) => {
    setBusy(true);
    try { await action(); setMessage(success); }
    catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Backup & Restore</h2>
          <p className="text-sm text-slate-500">Full local SQLite backups with a safety backup before restore</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={() => run(onRestore, "Restore completed — restarting Minarva Biz")}>Restore backup</Button>
          <Button disabled={busy} onClick={() => run(onCreate, "Backup created")}>Create backup</Button>
        </div>
      </div>

      {message && <p className="text-sm text-emerald-600">{message}</p>}

      <div className="space-y-2">
        {backups.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center text-slate-400">No backups yet</p>
        )}
        {backups.map((b) => (
          <Card key={b.id}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium text-slate-900">{b.filename}</div>
                <div className="text-xs text-slate-500">
                  {new Date(b.createdAt).toLocaleString("en-IN")} · {(b.sizeBytes / 1024).toFixed(1)} KB · {b.kind} · {b.verified ? "verified" : "unverified"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => {
                  const ok = onVerify(b.id);
                  setMessage(ok === undefined ? "Backup verification completed" : ok ? "Backup verified OK" : "Verification failed");
                }}>Verify</Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const r = onInspect(b.id);
                  setMessage(r === undefined ? "Backup inspection completed" : r.ok
                    ? `Contains: ${Object.entries(r.summary || {}).map(([k, v]) => `${k}=${v}`).join(", ")}`
                    : r.error || "Invalid");
                }}>Inspect</Button>
                <Button size="sm" onClick={() => onDownload(b.id)}>Download</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
