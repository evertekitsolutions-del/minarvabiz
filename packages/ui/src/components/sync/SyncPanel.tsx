"use client";

import * as React from "react";
import type { SyncSession, ConflictRecord, DeviceRegistration } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";

export function SyncPanel({
  online,
  outboxStats,
  sessions,
  conflicts,
  devices,
  lastSyncAt,
  onSync,
  onToggleOnline,
  onResolveConflict,
  syncing,
}: {
  online: boolean;
  outboxStats: { total: number; pending: number; synced: number; conflict: number; error: number };
  sessions: SyncSession[];
  conflicts: ConflictRecord[];
  devices: DeviceRegistration[];
  lastSyncAt?: string | null;
  onSync: () => void;
  onToggleOnline?: () => void;
  onResolveConflict?: (id: string, choice: "local" | "remote") => void;
  syncing?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Hybrid Sync</h2>
          <p className="text-sm text-slate-500">
            Local-first offline queue · cloud push/pull · conflict resolution
          </p>
        </div>
        <div className="flex gap-2">
          {onToggleOnline && (
            <Button variant="outline" onClick={onToggleOnline}>
              {online ? "Simulate offline" : "Go online"}
            </Button>
          )}
          <Button onClick={onSync} disabled={syncing || !online}>
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Connection</div>
            <div className={`text-lg font-bold ${online ? "text-emerald-600" : "text-amber-600"}`}>
              {online ? "Online" : "Offline"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Outbox pending</div>
            <div className="text-lg font-bold">{outboxStats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Conflicts</div>
            <div className={`text-lg font-bold ${conflicts.length ? "text-rose-600" : ""}`}>
              {conflicts.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Last sync</div>
            <div className="text-sm font-medium">
              {lastSyncAt ? new Date(lastSyncAt).toLocaleString("en-IN") : "Never"}
            </div>
          </CardContent>
        </Card>
      </div>

      {conflicts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-rose-700">Unresolved conflicts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {conflicts.map((c) => (
              <div key={c.id} className="rounded-lg border border-rose-100 bg-rose-50/50 p-3 text-sm">
                <div className="font-medium">
                  {c.tableName} · {c.recordId.slice(0, 8)}…
                </div>
                <div className="text-xs text-slate-500">
                  Local v{c.localVersion} vs Remote v{c.remoteVersion} · strategy: {c.strategy}
                </div>
                {c.strategy === "manual" && onResolveConflict && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => onResolveConflict(c.id, "local")}>
                      Keep local
                    </Button>
                    <Button size="sm" onClick={() => onResolveConflict(c.id, "remote")}>
                      Keep remote
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Outbox</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
          <div>Total: <strong>{outboxStats.total}</strong></div>
          <div>Pending: <strong>{outboxStats.pending}</strong></div>
          <div>Synced: <strong>{outboxStats.synced}</strong></div>
          <div>Conflict: <strong>{outboxStats.conflict}</strong></div>
          <div>Error: <strong>{outboxStats.error}</strong></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Recent sessions</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {sessions.length === 0 && <p className="text-sm text-slate-400">No sync sessions yet</p>}
          {sessions.slice(0, 8).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="capitalize font-medium">{s.status}</span>
              <span className="text-slate-500">
                ↑{s.pushed} ↓{s.pulled} · conflicts {s.conflicts} · errors {s.errors}
              </span>
              <span className="text-xs text-slate-400">
                {new Date(s.startedAt).toLocaleString("en-IN")}
              </span>
              {s.lastError && <span className="w-full text-xs text-rose-600">{s.lastError}</span>}
            </div>
          ))}
        </CardContent>
      </Card>

      {devices.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Devices</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {devices.map((d) => (
              <div key={d.id} className="flex justify-between">
                <span>{d.deviceName} ({d.platform})</span>
                <span className="text-slate-500">
                  {d.lastSyncAt ? new Date(d.lastSyncAt).toLocaleString("en-IN") : "Never synced"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
