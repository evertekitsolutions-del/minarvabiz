"use client";

import * as React from "react";
import { SyncPanel, PersistencePanel, SettingsPanel } from "@minarvabiz/ui";
import { syncBridge, exportDomainSnapshotJson, importDomainSnapshotJson, saveToLocalStorage, loadFromLocalStorage, getShopProfile, updateShopProfile, getTaxConfig, updateTaxConfig, getAutoBackupSettings, setAutoBackupSettings, getPrintSettings, updatePrintSettings } from "@minarvabiz/business-logic";

export default function SettingsPage() {
  const [snap, setSnap] = React.useState(() => syncBridge.getSyncSnapshot());
  const [syncing, setSyncing] = React.useState(false);
  const [shop, setShop] = React.useState(() => getShopProfile());
  const [tax, setTax] = React.useState(() => getTaxConfig());
  const [backup, setBackup] = React.useState(() => getAutoBackupSettings());
  const [printing, setPrinting] = React.useState(() => getPrintSettings());

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

      <SettingsPanel
        profile={shop}
        tax={tax}
        backup={backup}
        printing={printing}
        onSaveProfile={(patch) => {
          const next = updateShopProfile(patch);
          if (patch.gstin !== undefined) updateTaxConfig({ gstin: patch.gstin });
          setShop(next);
          saveToLocalStorage();
        }}
        onSaveTax={(patch) => {
          const next = updateTaxConfig(patch);
          setTax(next);
          if (patch.gstin !== undefined) setShop(updateShopProfile({ gstin: patch.gstin }));
          saveToLocalStorage();
        }}
        onSaveBackup={(patch) => {
          setAutoBackupSettings(patch);
          setBackup(getAutoBackupSettings());
          saveToLocalStorage();
        }}
        onSavePrinting={(patch) => {
          const next = updatePrintSettings(patch);
          setPrinting(next);
          saveToLocalStorage();
        }}
      />

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
