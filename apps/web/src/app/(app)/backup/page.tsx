"use client";

import * as React from "react";
import { BackupPanel, AuditLogList } from "@minarvabiz/ui";
import { phase7Store } from "@minarvabiz/business-logic";
import type { BackupMeta, AuditLogEntry } from "@minarvabiz/types";

export default function BackupPage() {
  const [backups, setBackups] = React.useState<BackupMeta[]>([]);
  const [logs, setLogs] = React.useState<AuditLogEntry[]>([]);
  const [tab, setTab] = React.useState<"backup" | "audit">("backup");

  const refresh = React.useCallback(() => {
    setBackups(phase7Store.listBackups());
    setLogs(phase7Store.listAuditLogs());
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "backup" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"}`}
          onClick={() => setTab("backup")}
        >Backup</button>
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "audit" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"}`}
          onClick={() => setTab("audit")}
        >Audit log</button>
      </div>
      {tab === "backup" && (
        <BackupPanel
          backups={backups}
          onCreate={() => { phase7Store.createBackup("manual"); refresh(); }}
          onVerify={(id) => phase7Store.verifyBackup(id)}
          onInspect={(id) => phase7Store.inspectBackup(id)}
          onDownload={(id) => {
            const payload = phase7Store.getBackupPayload(id);
            const meta = backups.find((b) => b.id === id);
            if (!payload || !meta) return;
            const blob = new Blob([payload], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = meta.filename;
            a.click();
            URL.revokeObjectURL(url);
          }}
        />
      )}
      {tab === "audit" && <AuditLogList logs={logs} />}
    </div>
  );
}
