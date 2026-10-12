"use client";

import * as React from "react";
import { BackupPanel, AuditLogList } from "@minarvabiz/ui";
import {
  can, exportDomainSnapshotJson, phase7Store, prepareBrowserSnapshotDownload,
  SNAPSHOT_VERSION, validateDomainSnapshot,
} from "@minarvabiz/business-logic";
import type { BackupMeta, AuditLogEntry } from "@minarvabiz/types";

export default function BackupPage() {
  const [backups, setBackups] = React.useState<BackupMeta[]>([]);
  const [logs, setLogs] = React.useState<AuditLogEntry[]>([]);
  const [tab, setTab] = React.useState<"backup" | "audit">("backup");
  const [downloadStatus, setDownloadStatus] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    setBackups(phase7Store.listBackups());
    setLogs(phase7Store.listAuditLogs());
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  function downloadLocalDomainSnapshot() {
    if (!can("backup.manage")) {
      setDownloadStatus("Your role does not have permission to export business records.");
      return;
    }
    if (!window.confirm(
      "This JSON file contains customer, staff and other sensitive business data currently loaded on this device. " +
      "It is NOT an export of all hosted cloud records. Save it securely. Continue?",
    )) return;

    let url: string | null = null;
    try {
      const file = prepareBrowserSnapshotDownload(exportDomainSnapshotJson(), SNAPSHOT_VERSION);
      // Use the existing shared-core import validator as a second safety check.
      const validated = validateDomainSnapshot(JSON.parse(file.content));
      if (!validated.ok) throw new Error(validated.error);
      const blob = new Blob([file.content], { type: file.mediaType });
      url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename;
      document.body.appendChild(anchor);
      try { anchor.click(); } finally { anchor.remove(); }
      setDownloadStatus("Current-device shared-core snapshot download requested. " +
        "Verify the file was saved before relying on it. This is not a cloud-server backup.");
    } catch (error) {
      setDownloadStatus("Snapshot export failed: " +
        (error instanceof Error ? error.message : String(error)));
    } finally {
      if (url) {
        const completedUrl = url;
        window.setTimeout(() => URL.revokeObjectURL(completedUrl), 2000);
      }
    }
  }

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
        <>
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-semibold text-slate-900">Export current-device business data</h2>
            <p className="text-sm text-slate-600">
              Download the current v{SNAPSHOT_VERSION} local shared-core snapshot, including
              available sales, inventory, customers, purchases, staff, accounts,
              branch data and settings. Unlike previous limited exports, this
              includes the shared domain snapshot fields. This does NOT export
              your hosted cloud database, independently test restore capability
              or replace native Windows SQLite backups.
            </p>
            <p className="text-sm text-amber-800">
              The file contains sensitive business information. Keep it in protected storage.
              Download a new copy whenever important data changes.
            </p>
            <button
              type="button"
              disabled={!can("backup.manage")}
              onClick={downloadLocalDomainSnapshot}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download full current-device snapshot (JSON)
            </button>
            {downloadStatus && <p role="status" className="text-sm text-slate-700">{downloadStatus}</p>}
          </section>
          <BackupPanel
            backups={backups}
            canManage={can("backup.manage")}
            legacyPartialArchive
            onVerify={(id) => phase7Store.verifyBackup(id)}
            onInspect={(id) => phase7Store.inspectBackup(id)}
            onDownload={(id) => {
              const payload = phase7Store.getBackupPayload(id);
              const meta = backups.find((b) => b.id === id);
              if (!payload || !meta) return;
              const blob = new Blob([payload], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = meta.filename;
              anchor.click();
              window.setTimeout(() => URL.revokeObjectURL(url), 2000);
            }}
          />
        </>
      )}
      {tab === "audit" && <AuditLogList logs={logs} />}
    </div>
  );
}
