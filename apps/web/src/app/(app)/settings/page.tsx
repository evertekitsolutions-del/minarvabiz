"use client";

import * as React from "react";
import { SyncPanel, PersistencePanel, Button, FormField, inputClass } from "@minarvabiz/ui";
import { syncBridge, exportDomainSnapshotJson, importDomainSnapshotJson, saveToLocalStorage, loadFromLocalStorage, getShopProfile, updateShopProfile } from "@minarvabiz/business-logic";

export default function SettingsPage() {
  const [snap, setSnap] = React.useState(() => syncBridge.getSyncSnapshot());
  const [syncing, setSyncing] = React.useState(false);
  const [shop, setShop] = React.useState(() => getShopProfile());
  const [shopMsg, setShopMsg] = React.useState<string | null>(null);

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

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">Shop profile (receipts)</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Shop name">
            <input className={inputClass} value={shop.shopName}
              onChange={(e) => setShop({ ...shop, shopName: e.target.value })} />
          </FormField>
          <FormField label="Phone">
            <input className={inputClass} value={shop.phone}
              onChange={(e) => setShop({ ...shop, phone: e.target.value })} />
          </FormField>
          <FormField label="Address" className="sm:col-span-2">
            <input className={inputClass} value={shop.address}
              onChange={(e) => setShop({ ...shop, address: e.target.value })} />
          </FormField>
          <FormField label="Email">
            <input className={inputClass} value={shop.email}
              onChange={(e) => setShop({ ...shop, email: e.target.value })} />
          </FormField>
          <FormField label="GSTIN">
            <input className={inputClass} value={shop.gstin}
              onChange={(e) => setShop({ ...shop, gstin: e.target.value })} />
          </FormField>
          <FormField label="Receipt footer" className="sm:col-span-2">
            <input className={inputClass} value={shop.receiptFooter}
              onChange={(e) => setShop({ ...shop, receiptFooter: e.target.value })} />
          </FormField>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => {
            const next = updateShopProfile(shop);
            setShop(next);
            setShopMsg("Shop profile saved");
          }}>Save shop profile</Button>
          {shopMsg && <span className="text-sm text-emerald-600">{shopMsg}</span>}
        </div>
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
