"use client";

import * as React from "react";
import { SyncPanel, PersistencePanel, Button } from "@minarvabiz/ui";
import { syncBridge, exportDomainSnapshotJson, importDomainSnapshotJson, saveToLocalStorage, loadFromLocalStorage } from "@minarvabiz/business-logic";

export default function SettingsPage() {
  const [snap, setSnap] = React.useState(() => syncBridge.getSyncSnapshot());
  const [syncing, setSyncing] = React.useState(false);

  function refresh() {
    setSnap(syncBridge.getSyncSnapshot());
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await syncBridge.runSync();
    } finally {
      setSyncing(false);
      refresh();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500">License, environment, and hybrid sync</p>
        </div>
        <a href="/license" className="text-sm font-medium text-indigo-600 hover:underline">
          License & Branches →
        </a>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            syncBridge.enqueueDemoWrite();
            refresh();
          }}
        >
          Enqueue offline write
        </Button>
      </div>

      <PersistencePanel
        onExport={() => exportDomainSnapshotJson()}
        onImport={(json) => importDomainSnapshotJson(json)}
        onSaveLocal={() => { saveToLocalStorage(); }}
        onLoadLocal={() => { loadFromLocalStorage(); }}
      />

      <SyncPanel
        online={snap.online}
        outboxStats={snap.outboxStats}
        sessions={snap.sessions}
        conflicts={snap.conflicts}
        devices={snap.devices}
        lastSyncAt={snap.lastSyncAt}
        syncing={syncing}
        onSync={handleSync}
        onToggleOnline={() => {
          syncBridge.setSyncOnline(!snap.online);
          refresh();
        }}
        onResolveConflict={(id, choice) => {
          syncBridge.resolveSyncConflict(id, choice);
          refresh();
        }}
      />
    </div>
  );
}
