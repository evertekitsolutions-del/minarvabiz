"use client";

import * as React from "react";
import { isSupabaseConfigured } from "@minarvabiz/database";
import { BackupPanel, AuditLogList } from "@minarvabiz/ui";
import {
  can, exportDomainSnapshotJson, importDomainSnapshotJson, inspectBrowserSnapshotForRecovery,
  MAX_BROWSER_SNAPSHOT_VERIFY_BYTES, phase7Store, prepareBrowserSnapshotDownload,
  restoreEmptyLocalBrowserSnapshot, SNAPSHOT_VERSION, validateDomainSnapshot,
} from "@minarvabiz/business-logic";
import type { BackupMeta, AuditLogEntry } from "@minarvabiz/types";
import type { BrowserSnapshotInspection } from "@minarvabiz/business-logic";

export default function BackupPage() {
  const [backups, setBackups] = React.useState<BackupMeta[]>([]);
  const [logs, setLogs] = React.useState<AuditLogEntry[]>([]);
  const [tab, setTab] = React.useState<"backup" | "audit">("backup");
  const [downloadStatus, setDownloadStatus] = React.useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = React.useState<string | null>(null);
  const [verifiedSnapshot, setVerifiedSnapshot] = React.useState<BrowserSnapshotInspection | null>(null);
  const [verifiedFile, setVerifiedFile] = React.useState<File | null>(null);
  const [restoring, setRestoring] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const verifyRequest = React.useRef(0);

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

  async function verifyDownloadedSnapshot(file: File | undefined) {
    const request = ++verifyRequest.current;
    setVerifiedSnapshot(null);
    setVerifiedFile(null);
    setVerifyStatus(null);
    if (!file) return;
    if (!can("backup.manage")) {
      setVerifyStatus("Your role does not have permission to inspect exported business records.");
      return;
    }
    setVerifying(true);
    try {
      if (!Number.isSafeInteger(file.size) || file.size <= 0 ||
          file.size > MAX_BROWSER_SNAPSHOT_VERIFY_BYTES) {
        throw new Error("File is empty or exceeds the 128 MiB browser verification limit.");
      }
      const text = await file.text();
      // This is a *read-only* inspection; do not import into online/hybrid data
      // or replace local state when cloud tenant/branch identity is unverified.
      const inspection = inspectBrowserSnapshotForRecovery(text, SNAPSHOT_VERSION, file.size);
      const validated = validateDomainSnapshot(JSON.parse(text));
      if (!validated.ok) throw new Error(validated.error);
      if (request !== verifyRequest.current) return;
      setVerifiedSnapshot(inspection);
      setVerifiedFile(file);
      setVerifyStatus("Snapshot structure verified for local v15 data. No data was restored or uploaded.");
    } catch (error) {
      if (request !== verifyRequest.current) return;
      const safe = error instanceof Error ? error.message : "Snapshot inspection failed";
      setVerifyStatus("Snapshot rejected: " + safe);
    } finally {
      if (request === verifyRequest.current) setVerifying(false);
    }
  }

  async function restoreStandaloneLocalWorkspace() {
    if (!verifiedFile || restoring) return;
    if (!can("backup.manage")) {
      setVerifyStatus("Backup management permission is required.");
      return;
    }
    const desktop = Boolean((window as Window & { minarvaDesktop?: unknown }).minarvaDesktop);
    if (isSupabaseConfigured() || desktop) {
      setVerifyStatus("JSON recovery is disabled for hosted, hybrid and native SQLite editions.");
      return;
    }
    if (!window.confirm(
      "Restore this file into a NEW EMPTY standalone browser workspace? " +
      "This cannot recover a cloud tenant or native Windows SQLite database. " +
      "Any existing business data or unsent sync events will block recovery. Continue?",
    )) return;
    setRestoring(true);
    try {
      if (verifiedFile.size <= 0 || verifiedFile.size > MAX_BROWSER_SNAPSHOT_VERIFY_BYTES) {
        throw new Error("Snapshot size is invalid");
      }
      const text = await verifiedFile.text();
      const inspected = inspectBrowserSnapshotForRecovery(text, SNAPSHOT_VERSION, verifiedFile.size);
      const valid = validateDomainSnapshot(JSON.parse(text));
      if (!valid.ok) throw new Error(valid.error);
      const result = restoreEmptyLocalBrowserSnapshot(
        window.localStorage, text, exportDomainSnapshotJson(),
        { authorized: can("backup.manage"), cloudConfigured: isSupabaseConfigured(), nativeDesktop: desktop },
        importDomainSnapshotJson,
      );
      if (!result.ok) throw new Error(result.error);
      setVerifiedSnapshot(inspected);
      setVerifyStatus("Local recovery committed. Reloading restored standalone workspace.");
      window.location.reload();
    } catch (error) {
      setVerifyStatus("Recovery blocked: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setRestoring(false);
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
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-semibold text-slate-900">Verify a downloaded snapshot</h2>
            <p className="text-sm text-slate-600">
              Choose a previously downloaded v{SNAPSHOT_VERSION} current-device snapshot JSON file.
              We check its structure and show record counts without uploading, importing or
              overwriting anything. This is not a verified restore, a server backup or proof
              that every cloud record is present.
            </p>
            <label className="block space-y-1 text-sm font-medium text-slate-800">
              <span>Choose snapshot file (maximum 128 MiB)</span>
              <input
                type="file"
                accept=".json,application/json"
                aria-label="Choose local snapshot file to verify"
                disabled={!can("backup.manage") || verifying}
                className="block w-full rounded-md border border-slate-300 p-2 text-sm disabled:opacity-50"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  void verifyDownloadedSnapshot(file);
                }}
              />
            </label>
            {verifying && <p role="status" className="text-sm text-slate-600">Checking local snapshot…</p>}
            {verifyStatus && <p role="status" className="text-sm text-slate-700">{verifyStatus}</p>}
            {verifiedFile && !isSupabaseConfigured() && (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-amber-900">
                  Standalone browser only: restore into a new empty local workspace. Existing
                  data, company identity and pending sync events block recovery. For Online,
                  Hybrid or Windows SQLite use the authorized edition-specific recovery flow.
                </p>
                <button
                  type="button"
                  disabled={restoring || !can("backup.manage")}
                  className="rounded-lg bg-amber-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() => void restoreStandaloneLocalWorkspace()}
                >
                  {restoring ? "Restoring local workspace…" : "Restore to empty standalone workspace"}
                </button>
              </div>
            )}
            {verifiedSnapshot && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
                <p>Snapshot version {verifiedSnapshot.version}, exported {verifiedSnapshot.exportedAt}</p>
                <p>Customers: {verifiedSnapshot.recordCounts.customers};
                  Products: {verifiedSnapshot.recordCounts.products};
                  Sales: {verifiedSnapshot.recordCounts.sales};
                  Purchases: {verifiedSnapshot.recordCounts.purchases};
                  Staff: {verifiedSnapshot.recordCounts.staff};
                  Branches: {verifiedSnapshot.recordCounts.branches}</p>
                <p>Accounting: {verifiedSnapshot.sections.accounting ? "included" : "not present"};
                  Warehouses: {verifiedSnapshot.sections.warehouse ? "included" : "not present"};
                  Procurement: {verifiedSnapshot.sections.procurement ? "included" : "not present"}</p>
              </div>
            )}
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
