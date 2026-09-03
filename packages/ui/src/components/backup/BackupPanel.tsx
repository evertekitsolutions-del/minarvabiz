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
}: {
  backups: BackupMeta[];
  onCreate: () => void;
  onVerify: (id: string) => boolean | void;
  onDownload: (id: string) => void;
  onInspect: (id: string) => { ok: boolean; summary?: Record<string, number>; error?: string } | void;
}) {
  const [message, setMessage] = React.useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Backup & Restore</h2>
          <p className="text-sm text-slate-500">Local snapshots — never auto-delete the only backup</p>
        </div>
        <Button onClick={() => { onCreate(); setMessage("Backup created"); }}>Create backup</Button>
      </div>

      {message && <p className="text-sm text-emerald-600">{message}</p>}

      <div className="space-y-2">
        {backups.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center text-slate-400">
            No backups yet
          </p>
        )}
        {backups.map((b) => (
          <Card key={b.id}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium text-slate-900">{b.filename}</div>
                <div className="text-xs text-slate-500">
                  {new Date(b.createdAt).toLocaleString("en-IN")} · {(b.sizeBytes / 1024).toFixed(1)} KB ·{" "}
                  {b.kind} · {b.verified ? "verified" : "unverified"}
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
