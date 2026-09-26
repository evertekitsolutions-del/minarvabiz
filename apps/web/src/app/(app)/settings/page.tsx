"use client";

import * as React from "react";
import { SyncPanel, PersistencePanel, Button, FormField, inputClass, selectClass, PrintTemplateManager } from "@minarvabiz/ui";
import { syncBridge, exportDomainSnapshotJson, importDomainSnapshotJson, saveToLocalStorage, loadFromLocalStorage, getShopProfile, updateShopProfile, updateTaxConfig, getPrintSettings, updatePrintSettings } from "@minarvabiz/business-logic";

export default function SettingsPage() {
  const [snap, setSnap] = React.useState(() => syncBridge.getSyncSnapshot());
  const [syncing, setSyncing] = React.useState(false);
  const [shop, setShop] = React.useState(() => getShopProfile());
  const [shopMsg, setShopMsg] = React.useState<string | null>(null);
  const [printing, setPrinting] = React.useState(() => getPrintSettings());
  const [printMsg, setPrintMsg] = React.useState<string | null>(null);

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

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">Business profile</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Business / trade name"><input className={inputClass} value={shop.shopName} onChange={(e) => setShop({ ...shop, shopName: e.target.value })} /></FormField>
          <FormField label="Registered legal name"><input className={inputClass} value={shop.legalName} onChange={(e) => setShop({ ...shop, legalName: e.target.value })} /></FormField>
          <FormField label="Document code"><input className={inputClass} maxLength={8} value={shop.documentCode} onChange={(e) => setShop({ ...shop, documentCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="e.g. MT" /></FormField>
          <FormField label="GSTIN"><input className={inputClass} maxLength={15} value={shop.gstin} onChange={(e) => setShop({ ...shop, gstin: e.target.value.toUpperCase().replace(/\s/g, "") })} /></FormField>
          <FormField label="Address line 1" className="sm:col-span-2"><input className={inputClass} value={shop.address} onChange={(e) => setShop({ ...shop, address: e.target.value })} /></FormField>
          <FormField label="Address line 2" className="sm:col-span-2"><input className={inputClass} value={shop.addressLine2} onChange={(e) => setShop({ ...shop, addressLine2: e.target.value })} /></FormField>
          <FormField label="District / city"><input className={inputClass} value={shop.district} onChange={(e) => setShop({ ...shop, district: e.target.value })} /></FormField>
          <FormField label="State / province"><input className={inputClass} value={shop.state} onChange={(e) => setShop({ ...shop, state: e.target.value })} /></FormField>
          <FormField label="Country"><input className={inputClass} value={shop.country} onChange={(e) => setShop({ ...shop, country: e.target.value })} /></FormField>
          <FormField label="Postal / PIN code"><input className={inputClass} value={shop.postalCode} onChange={(e) => setShop({ ...shop, postalCode: e.target.value })} /></FormField>
          <FormField label="Phone"><input className={inputClass} value={shop.phone} onChange={(e) => setShop({ ...shop, phone: e.target.value })} /></FormField>
          <FormField label="Email"><input className={inputClass} type="email" value={shop.email} onChange={(e) => setShop({ ...shop, email: e.target.value })} /></FormField>
          <FormField label="Website"><input className={inputClass} value={shop.website} onChange={(e) => setShop({ ...shop, website: e.target.value })} /></FormField>
          <FormField label="Currency"><select className={selectClass} value={shop.currency} onChange={(e) => setShop({ ...shop, currency: e.target.value })}><option value="INR">INR — Indian Rupee</option><option value="OMR">OMR — Omani Rial</option><option value="AED">AED — UAE Dirham</option><option value="USD">USD — US Dollar</option></select></FormField>
          <FormField label="Receipt footer" className="sm:col-span-2"><input className={inputClass} value={shop.receiptFooter} onChange={(e) => setShop({ ...shop, receiptFooter: e.target.value })} /></FormField>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => {
            const next = updateShopProfile(shop);
            updateTaxConfig({ gstin: next.gstin });
            setShop(next);
            setShopMsg("Business profile saved");
          }}>Save shop profile</Button>
          {shopMsg && <span className="text-sm text-emerald-600">{shopMsg}</span>}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Browser printing defaults</h2>
          <p className="text-xs text-slate-500">Web browsers choose the physical printer in the system print dialog. These settings control the default invoice layout and thermal width.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Default invoice paper">
            <select className={selectClass} value={printing.defaultInvoicePaper} onChange={(e) => setPrinting({ ...printing, defaultInvoicePaper: e.target.value as "a4" | "thermal" })}>
              <option value="a4">A4</option><option value="thermal">Thermal</option>
            </select>
          </FormField>
          <FormField label="Thermal receipt width">
            <select className={selectClass} value={printing.thermalWidthMm} onChange={(e) => setPrinting({ ...printing, thermalWidthMm: Number(e.target.value) === 58 ? 58 : 80 })}>
              <option value={80}>80 mm</option><option value={58}>58 mm</option>
            </select>
          </FormField>
          <FormField label="Product label code">
            <select className={selectClass} value={printing.labelCodeMode} onChange={(e) => setPrinting({ ...printing, labelCodeMode: e.target.value as "barcode" | "qr" | "both" })}>
              <option value="both">Barcode + QR code</option><option value="barcode">Barcode only</option><option value="qr">QR code only</option>
            </select>
          </FormField>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => { const next = updatePrintSettings(printing); setPrinting(next); setPrintMsg("Printing defaults saved"); }}>Save printing defaults</Button>
          {printMsg && <span className="text-sm text-emerald-600">{printMsg}</span>}
        </div>
      </div>

      <PrintTemplateManager />

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
