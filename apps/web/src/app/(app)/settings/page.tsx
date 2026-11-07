"use client";

import * as React from "react";
import { parseGoogleReviewUrl, formatWorkspaceDateTime, formatWorkspaceMoney, validateWorkspaceDisplayPreferences, isProductionMode } from "@minarvabiz/business-logic";
import { SyncPanel, PersistencePanel, Button, FormField, inputClass, selectClass, PrintTemplateManager, TrashRecoveryPanel } from "@minarvabiz/ui";
import { syncBridge, exportDomainSnapshotJson, importDomainSnapshotJson, saveToLocalStorage, loadFromLocalStorage, getShopProfile, updateShopProfile, updateTaxConfig, getPrintSettings, updatePrintSettings, getScopedMasterReplayStatus, retryScopedMasterOutbox } from "@minarvabiz/business-logic";

export default function SettingsPage() {
  const [snap, setSnap] = React.useState(() => syncBridge.getSyncSnapshot());
  const [syncing, setSyncing] = React.useState(false);
  const [shop, setShop] = React.useState(() => getShopProfile());
  const [shopMsg, setShopMsg] = React.useState<string | null>(null);
  const [shopMsgIsError, setShopMsgIsError] = React.useState(false);
  const [printing, setPrinting] = React.useState(() => getPrintSettings());
  const [masterReplay, setMasterReplay] = React.useState(() => getScopedMasterReplayStatus());
  const [masterRetrying, setMasterRetrying] = React.useState(false);
  const [masterReplayMessage, setMasterReplayMessage] = React.useState<string | null>(null);

  const [printMsg, setPrintMsg] = React.useState<string | null>(null);

  // The domain snapshot is hydrated after the initial client render in some
  // Offline/Hybrid sessions. Refresh the editor so saving does not overwrite
  // restored business preferences with stale pre-hydration defaults.
  React.useEffect(() => {
    const onHydrated = () => {
      setShop(getShopProfile());
      setPrinting(getPrintSettings());
      setShopMsg(null);
      setShopMsgIsError(false);
      setPrintMsg(null);
    };
    window.addEventListener("minarva:data-hydrated", onHydrated);
    return () => window.removeEventListener("minarva:data-hydrated", onHydrated);
  }, []);

  function refresh() {
    setSnap(syncBridge.getSyncSnapshot());
  }

  const handleMasterReplay = React.useCallback(async () => {
    if (!getScopedMasterReplayStatus().available) return;
    setMasterRetrying(true);
    try {
      const result = await retryScopedMasterOutbox();
      setMasterReplayMessage(
        `Cloud master retry: ${result.acknowledged} acknowledged, ${result.failed} failed; ${result.remaining} events still pending or failed.`
      );
    } catch (error) {
      setMasterReplayMessage(error instanceof Error ? error.message : "Cloud master retry failed.");
    } finally {
      setMasterRetrying(false);
      setMasterReplay(getScopedMasterReplayStatus());
    }
  }, []);

  React.useEffect(() => {
    const refreshStatus = () => setMasterReplay(getScopedMasterReplayStatus());
    const onReconnect = () => {
      // Only already verified owner-scoped master changes are eligible;
      // financial entries remain in their transactional reconciliation path.
      if (getScopedMasterReplayStatus().ready > 0) void handleMasterReplay();
    };
    window.addEventListener("online", onReconnect);
    window.addEventListener("minarva:data-hydrated", refreshStatus);
    refreshStatus();
    return () => {
      window.removeEventListener("online", onReconnect);
      window.removeEventListener("minarva:data-hydrated", refreshStatus);
    };
  }, [handleMasterReplay]);


  async function handleSync() {
    setSyncing(true);
    try {
      await syncBridge.runSync();
    } finally {
      setSyncing(false);
      refresh();
    }
  }

  const displayPreferences = { locale: shop.locale ?? "en-IN", timeZone: shop.timeZone ?? "Asia/Kolkata", currency: shop.currency };
  let displayValidationError: string | null = null;
  try {
    validateWorkspaceDisplayPreferences(displayPreferences);
  } catch (error) {
    displayValidationError = error instanceof Error ? error.message : "Invalid display preferences.";
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
          <FormField label="Google review link"><input className={inputClass} type="url" value={shop.googleReviewUrl ?? ""} onChange={(e) => setShop({ ...shop, googleReviewUrl: e.target.value })} placeholder="https://g.page/r/.../review" /><p className="mt-1 text-xs text-slate-500">Optional. An official HTTPS Google link is included in post-delivery feedback WhatsApp messages.</p></FormField>
          <FormField label="Currency (ISO 4217)">
            <input className={inputClass} maxLength={3} value={shop.currency} onChange={(e) => setShop({ ...shop, currency: e.target.value.toUpperCase() })} placeholder="INR / OMR / USD" />
          </FormField>
          <FormField label="Display language / locale (BCP 47)">
            <input className={inputClass} value={shop.locale ?? "en-IN"} onChange={(e) => setShop({ ...shop, locale: e.target.value })} placeholder="en-IN / ar-OM / en-US" />
          </FormField>
          <FormField label="Time zone (IANA)">
            <input className={inputClass} value={shop.timeZone ?? "Asia/Kolkata"} onChange={(e) => setShop({ ...shop, timeZone: e.target.value })} placeholder="Asia/Kolkata / Asia/Muscat" />
          </FormField>
          <div className="sm:col-span-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700" role="status">
            <strong>Display preview (not a transaction): </strong>
            {(() => {
              try {
                const preferences = displayPreferences;
                return formatWorkspaceMoney(1234.5, preferences) + " · " + formatWorkspaceDateTime("2026-01-15T12:00:00Z", preferences);
              } catch {
                return "Enter a supported locale, time zone and currency to preview.";
              }
            })()}
            <p className="mt-1 text-slate-500">These settings control display preferences only. Tax rules, accounting values and fiscal-year numbering remain unchanged.</p>
          </div>
          <FormField label="Receipt footer" className="sm:col-span-2"><input className={inputClass} value={shop.receiptFooter} onChange={(e) => setShop({ ...shop, receiptFooter: e.target.value })} /></FormField>
        </div>
        {displayValidationError && <p role="alert" className="text-sm text-red-700">Display preferences: {displayValidationError}</p>}
        <div className="flex items-center gap-2">
          <Button disabled={displayValidationError !== null} onClick={() => {
            try {
              // Production web has no durable profile writer in touchPersistence().
              // Fail closed instead of showing a false saved confirmation.
              if (isProductionMode() && typeof (window as Window & { __minarvaDesktopPersist?: () => void }).__minarvaDesktopPersist !== "function") {
                throw new Error("Saving business settings is unavailable in this browser workspace. No changes were saved. Use a configured persistent workspace.");
              }
              const googleReviewUrl = parseGoogleReviewUrl(shop.googleReviewUrl ?? "");
              // Persist the validated canonical locale/zone/currency, not the raw
              // editor strings (which may contain whitespace or IANA aliases).
              const normalizedDisplay = validateWorkspaceDisplayPreferences({
                locale: shop.locale ?? "en-IN",
                timeZone: shop.timeZone ?? "Asia/Kolkata",
                currency: shop.currency,
              });
              const next = updateShopProfile({ ...shop, ...normalizedDisplay, googleReviewUrl }, shop.updatedAt);
              updateTaxConfig({ gstin: next.gstin });
              setShop(next);
              setShopMsgIsError(false);
              setShopMsg("Business profile updated locally; durable save and cloud sync are not yet verified.");
            } catch (error) {
              setShopMsgIsError(true);
              setShopMsg(error instanceof Error ? error.message : "Unable to save business profile.");
            }
          }}>Save shop profile</Button>
          {shopMsg && <span role={shopMsgIsError ? "alert" : "status"} className={shopMsgIsError ? "text-sm text-rose-700" : "text-sm text-emerald-600"}>{shopMsg}</span>}
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
          <Button onClick={() => {
            // Browser-only production sessions have no durable settings writer.
            if (isProductionMode() && typeof (window as Window & { __minarvaDesktopPersist?: () => void }).__minarvaDesktopPersist !== "function") {
              setPrintMsg("Printing defaults cannot be saved in this browser workspace. No changes were saved.");
              return;
            }
            try {
              const next = updatePrintSettings({ defaultInvoicePaper: printing.defaultInvoicePaper, thermalWidthMm: printing.thermalWidthMm, labelCodeMode: printing.labelCodeMode });
              setPrinting(next);
              setPrintMsg("Printing defaults updated locally; verify persistence before restarting.");
            } catch (error) {
              setPrintMsg(error instanceof Error ? `Printing defaults were not updated: ${error.message}` : "Printing defaults could not be updated.");
            }
          }}>Save printing defaults</Button>
          {printMsg && <span role="status" className="text-sm text-slate-700">{printMsg}</span>}
        </div>
      </div>

      <TrashRecoveryPanel />

      <PrintTemplateManager />

      <PersistencePanel
        onExport={() => exportDomainSnapshotJson()}
        onImport={(json) => importDomainSnapshotJson(json)}
        onSaveLocal={() => { saveToLocalStorage(); }}
        onLoadLocal={() => { loadFromLocalStorage(); }}
      />

      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3" aria-labelledby="cloud-master-recovery">
        <h2 id="cloud-master-recovery" className="text-sm font-semibold text-slate-800">Offline master-data cloud recovery</h2>
        <p className="text-sm text-slate-600">
          Retry previously queued customer, category and product changes using your verified organization account.
          Unsynced financial, stock or payment transactions are held for transactional reconciliation; this is not a full Hybrid Sync.
        </p>
        <div className="flex flex-wrap gap-4 text-sm text-slate-700" role="status" aria-live="polite">
          <span>Queued: <strong>{masterReplay.pending}</strong></span>
          <span>Safe to retry: <strong>{masterReplay.ready}</strong></span>
          <span>Held for review or unsupported: <strong>{masterReplay.blocked}</strong></span>
        </div>
        {!masterReplay.available && (
          <p className="text-xs text-amber-700">Cloud retry is unavailable until your online organization membership is verified. Unscoped or other-business events will never be uploaded automatically.</p>
        )}
        <Button
          variant="outline"
          onClick={() => { void handleMasterReplay(); }}
          disabled={!masterReplay.available || masterReplay.ready === 0 || masterRetrying}
        >
          {masterRetrying ? "Retrying verified cloud writes…" : "Retry safe queued records"}
        </Button>
        {masterReplayMessage && <p className="text-xs text-slate-700" role="status">{masterReplayMessage}</p>}
      </section>

      <SyncPanel
        cloudSyncAvailable={snap.cloudSyncAvailable}
        demoMode={snap.demoMode}
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
