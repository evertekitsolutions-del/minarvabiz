import * as React from "react";
import { Button } from "../Button";
import { FormField, inputClass, selectClass } from "../forms/FormField";
import { PrintTemplateManager } from "./PrintTemplateManager";
import { code128Svg, qrSvg } from "@minarvabiz/business-logic";

export interface SettingsPanelProps {
  profile: {
    shopName: string;
    legalName: string;
    documentCode: string;
    address: string;
    addressLine2: string;
    district: string;
    state: string;
    country: string;
    postalCode: string;
    phone: string;
    email: string;
    website: string;
    gstin: string;
    receiptFooter: string;
    currency: string;
  };
  tax: { enableGst: boolean; defaultRatePercent: number };
  backup: { enabled: boolean; intervalHours: number; retentionCount: number; destinationPath: string };
  printing: {
    defaultInvoicePaper: "a4" | "thermal";
    thermalWidthMm: 58 | 80;
    a4PrinterName: string;
    thermalPrinterName: string;
    labelPrinterName: string;
    labelWidthMm: number;
    labelHeightMm: number;
    silentDesktopPrint: boolean;
    invoiceA4TemplateId: string;
    invoiceThermalTemplateId: string;
    quotationA4TemplateId: string;
    quotationThermalTemplateId: string;
    labelCodeMode: "barcode" | "qr" | "both";
  };
  onSaveProfile: (patch: Partial<SettingsPanelProps["profile"]>) => void;
  onSaveTax: (patch: Partial<SettingsPanelProps["tax"]>) => void;
  onSaveBackup: (patch: Partial<SettingsPanelProps["backup"]>) => void;
  onSavePrinting: (patch: Partial<SettingsPanelProps["printing"]>) => void;
}

type ThemeId = "light" | "midnight" | "ocean" | "emerald" | "violet";
const THEME_KEY = "minarvabiz.ui.theme";
const THEMES: Array<{ id: ThemeId; name: string; description: string; preview: string }> = [
  { id: "light", name: "Light", description: "Clean professional workspace", preview: "bg-white" },
  { id: "midnight", name: "Midnight", description: "Deep dark executive look", preview: "bg-slate-900" },
  { id: "ocean", name: "Ocean", description: "Crisp blue business theme", preview: "bg-blue-600" },
  { id: "emerald", name: "Emerald", description: "Modern green operations theme", preview: "bg-emerald-600" },
  { id: "violet", name: "Violet", description: "Premium creative fashion theme", preview: "bg-violet-600" },
];

function readTheme(): ThemeId {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_KEY) as ThemeId | null;
  return THEMES.some((theme) => theme.id === stored) ? (stored as ThemeId) : "light";
}

function applyTheme(theme: ThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(THEME_KEY, theme);
}

type DesktopDiagnosticsApi = {
  getVersion: () => Promise<string>;
  platform: string;
  sqliteExists: () => Promise<boolean>;
  readSqliteBinary: () => Promise<Uint8Array | null>;
  listBackups: () => Promise<Array<{ createdAt: string; sizeBytes: number; kind: "manual" | "automatic"; verified: boolean }>>;
  chooseBackupDirectory: () => Promise<string | null>;
  useDriveDBackup?: () => Promise<{ ok: boolean; path?: string; error?: string }>;
  getLicenseState: () => Promise<{ status: string; plan: string | null; edition: string | null; daysRemaining: number | null; graceDaysRemaining: number | null; reason?: string }>;
  listPrinters?: () => Promise<Array<{ name: string; displayName: string; description: string; status: number; isDefault: boolean }>>;
  printHtml?: (input: { html: string; deviceName?: string | null; paper?: "a4" | "thermal" | "label"; thermalWidthMm?: number; labelWidthMm?: number; labelHeightMm?: number; silent?: boolean }) => Promise<{ ok: boolean; error?: string }>;
  checkForUpdates?: () => Promise<{ status: "disabled" | "up_to_date" | "available" | "error"; currentVersion: string; version?: string; publishedAt?: string; notes?: string; error?: string }>;
  downloadUpdate?: () => Promise<{ ok: boolean; version?: string; installerPath?: string; error?: string }>;
  installUpdate?: () => Promise<{ ok: boolean; version?: string; backupPath?: string; error?: string }>;
};

function getDiagnosticsApi(): DesktopDiagnosticsApi | null {
  return (window as unknown as { minarvaDesktop?: DesktopDiagnosticsApi }).minarvaDesktop ?? null;
}

export function SettingsPanel({ profile, tax, backup, printing, onSaveProfile, onSaveTax, onSaveBackup, onSavePrinting }: SettingsPanelProps) {
  const [draftProfile, setDraftProfile] = React.useState(profile);
  const [draftTax, setDraftTax] = React.useState(tax);
  const [draftBackup, setDraftBackup] = React.useState(backup);
  const [draftPrinting, setDraftPrinting] = React.useState(printing);
  const [printers, setPrinters] = React.useState<Array<{ name: string; displayName: string; description: string; status: number; isDefault: boolean }>>([]);
  const [theme, setTheme] = React.useState<ThemeId>(readTheme);
  const [diagnosticState, setDiagnosticState] = React.useState<"idle" | "working" | "done" | "error">("idle");
  const [diagnosticMessage, setDiagnosticMessage] = React.useState("");
  const [updateState, setUpdateState] = React.useState<"idle" | "checking" | "available" | "downloading" | "ready" | "up_to_date" | "disabled" | "error">("idle");
  const [updateVersion, setUpdateVersion] = React.useState("");
  const [updateMessage, setUpdateMessage] = React.useState("");
  const [printTestState, setPrintTestState] = React.useState<"idle" | "working" | "done" | "error">("idle");
  const [printTestMessage, setPrintTestMessage] = React.useState("");
  React.useEffect(() => setDraftProfile(profile), [profile]);
  React.useEffect(() => setDraftTax(tax), [tax]);
  React.useEffect(() => setDraftBackup(backup), [backup]);
  React.useEffect(() => setDraftPrinting(printing), [printing]);
  React.useEffect(() => { const api = getDiagnosticsApi(); if (!api?.listPrinters) return; void api.listPrinters().then(setPrinters).catch(() => setPrinters([])); }, []);
  React.useEffect(() => applyTheme(theme), [theme]);

  function selectTheme(next: ThemeId) {
    setTheme(next);
    applyTheme(next);
  }

  async function checkUpdates() {
    const api = getDiagnosticsApi();
    if (!api?.checkForUpdates) {
      setUpdateState("disabled");
      setUpdateMessage("Secure updates are available in the Windows desktop edition.");
      return;
    }
    setUpdateState("checking"); setUpdateMessage("");
    try {
      const result = await api.checkForUpdates();
      setUpdateVersion(result.version || "");
      if (result.status === "available") { setUpdateState("available"); setUpdateMessage(result.notes || `Version ${result.version} is available.`); return; }
      if (result.status === "up_to_date") { setUpdateState("up_to_date"); setUpdateMessage(`Minarva Biz ${result.currentVersion} is up to date.`); return; }
      if (result.status === "disabled") { setUpdateState("disabled"); setUpdateMessage("Secure update channel is not configured on this build."); return; }
      setUpdateState("error"); setUpdateMessage(result.error || "Unable to check for updates.");
    } catch (error) {
      setUpdateState("error"); setUpdateMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function downloadUpdate() {
    const api = getDiagnosticsApi();
    if (!api?.downloadUpdate) return;
    setUpdateState("downloading"); setUpdateMessage("Downloading and verifying the signed installer…");
    try {
      const result = await api.downloadUpdate();
      if (!result.ok) { setUpdateState("error"); setUpdateMessage(result.error || "Update download failed."); return; }
      setUpdateState("ready"); setUpdateVersion(result.version || updateVersion); setUpdateMessage("Update verified and ready. Installation will create a fresh database backup first.");
    } catch (error) {
      setUpdateState("error"); setUpdateMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function installUpdate() {
    const api = getDiagnosticsApi();
    if (!api?.installUpdate) return;
    setUpdateMessage("Creating verified pre-update backup and starting installer…");
    try {
      const result = await api.installUpdate();
      if (!result.ok) { setUpdateState("error"); setUpdateMessage(result.error || "Update installation was blocked."); return; }
      setUpdateMessage(`Installer started for ${result.version || updateVersion}. Pre-update backup created successfully.`);
    } catch (error) {
      setUpdateState("error"); setUpdateMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function chooseBackupLocation() { const api = getDiagnosticsApi(); if (!api) return; try { const selected = await api.chooseBackupDirectory(); if (selected) { setDraftBackup((prev) => ({ ...prev, destinationPath: selected })); onSaveBackup({ destinationPath: selected }); } } catch (error) { setDiagnosticState("error"); setDiagnosticMessage(error instanceof Error ? error.message : "Unable to choose backup folder."); } }

  async function useDriveDBackup() {
    const api = getDiagnosticsApi();
    if (!api?.useDriveDBackup) {
      setDiagnosticState("error");
      setDiagnosticMessage("D: drive backup selection is available only in the Windows desktop edition.");
      return;
    }
    try {
      const result = await api.useDriveDBackup();
      if (!result.ok || !result.path) {
        setDiagnosticState("error");
        setDiagnosticMessage(result.error || "Unable to configure D: drive backup.");
        return;
      }
      setDraftBackup((prev) => ({ ...prev, enabled: true, destinationPath: result.path! }));
      onSaveBackup({ enabled: true, destinationPath: result.path });
      setDiagnosticState("done");
      setDiagnosticMessage(`Automatic backups will be stored in ${result.path}`);
    } catch (error) {
      setDiagnosticState("error");
      setDiagnosticMessage(error instanceof Error ? error.message : "Unable to configure D: drive backup.");
    }
  }

  async function testSelectedPrinter() {
    const api = getDiagnosticsApi();
    if (!api?.printHtml) {
      setPrintTestState("error");
      setPrintTestMessage("Printer testing is available only in the Windows desktop edition.");
      return;
    }
    const paper = draftPrinting.defaultInvoicePaper;
    const deviceName = paper === "thermal" ? draftPrinting.thermalPrinterName : draftPrinting.a4PrinterName;
    if (!deviceName) {
      setPrintTestState("error");
      setPrintTestMessage(`Select a ${paper === "thermal" ? "thermal" : "A4"} printer before running a test print.`);
      return;
    }
    setPrintTestState("working");
    setPrintTestMessage("Sending test page to the selected printer…");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Minarva Biz Printer Test</title>
<style>body{font-family:system-ui,sans-serif;padding:18px}h1{font-size:18px;margin:0 0 8px}p{font-size:12px;margin:4px 0}</style>
</head><body><h1>Minarva Biz Printer Test</h1><p>Printer: ${deviceName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p><p>Paper: ${paper === "thermal" ? `${draftPrinting.thermalWidthMm} mm thermal` : "A4"}</p><p>${new Date().toLocaleString()}</p></body></html>`;
    try {
      const result = await api.printHtml({ html, deviceName, paper, thermalWidthMm: draftPrinting.thermalWidthMm, silent: true });
      if (!result.ok) {
        setPrintTestState("error");
        setPrintTestMessage(result.error || "The printer rejected the test page.");
        return;
      }
      setPrintTestState("done");
      setPrintTestMessage(`Test page sent successfully to ${deviceName}.`);
    } catch (error) {
      setPrintTestState("error");
      setPrintTestMessage(error instanceof Error ? error.message : "Unable to print the test page.");
    }
  }

  async function testLabelPrinter() {
    const api = getDiagnosticsApi();
    if (!api?.printHtml) {
      setPrintTestState("error");
      setPrintTestMessage("Label printer testing is available only in the Windows desktop edition.");
      return;
    }
    const deviceName = draftPrinting.labelPrinterName || draftPrinting.thermalPrinterName;
    if (!deviceName) {
      setPrintTestState("error");
      setPrintTestMessage("Select a label printer (or thermal printer fallback) before running a label test.");
      return;
    }
    setPrintTestState("working");
    setPrintTestMessage("Sending barcode label test to the selected printer…");
    const width = Math.max(20, Math.min(120, Number(draftPrinting.labelWidthMm) || 50));
    const height = Math.max(15, Math.min(150, Number(draftPrinting.labelHeightMm) || 30));
    const testCode = "MBIZ-2900000001";
    const codeBlock = draftPrinting.labelCodeMode === "barcode"
      ? `<div class="barcode">${code128Svg(testCode)}</div>`
      : draftPrinting.labelCodeMode === "qr"
        ? `<div class="qr">${qrSvg(testCode)}</div>`
        : `<div class="codes"><div class="barcode">${code128Svg(testCode)}</div><div class="qr">${qrSvg(testCode)}</div></div>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Minarva Biz Label Test</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}.label{width:${width}mm;height:${height}mm;padding:2mm;text-align:center;overflow:hidden}.name{font-size:10px;font-weight:700}.codes{display:flex;align-items:center;gap:1mm}.barcode{flex:1}.barcode-svg{width:100%;height:13mm}.qr{width:14mm;margin:0 auto}.qr-svg{width:100%;height:auto}.code{font-size:8px}</style>
</head><body><div class="label"><div class="name">Minarva Biz Label Test</div>${codeBlock}<div class="code">${testCode}</div></div></body></html>`;
    try {
      const result = await api.printHtml({ html, deviceName, paper: "label", labelWidthMm: width, labelHeightMm: height, silent: true });
      if (!result.ok) {
        setPrintTestState("error");
        setPrintTestMessage(result.error || "The label printer rejected the test page.");
        return;
      }
      setPrintTestState("done");
      setPrintTestMessage(`Test label sent successfully to ${deviceName}.`);
    } catch (error) {
      setPrintTestState("error");
      setPrintTestMessage(error instanceof Error ? error.message : "Unable to print the label test.");
    }
  }

  async function exportDiagnostics() {
    const api = getDiagnosticsApi();
    if (!api) {
      setDiagnosticState("error");
      setDiagnosticMessage("Desktop diagnostics are available only in the Minarva Biz desktop app.");
      return;
    }
    setDiagnosticState("working");
    setDiagnosticMessage("");
    try {
      const [version, sqliteExists, sqliteBinary, backups, license] = await Promise.all([
        api.getVersion(),
        api.sqliteExists(),
        api.readSqliteBinary(),
        api.listBackups(),
        api.getLicenseState(),
      ]);
      const verifiedBackups = backups.filter((item) => item.verified).length;
      const automaticBackups = backups.filter((item) => item.kind === "automatic").length;
      const manualBackups = backups.filter((item) => item.kind === "manual").length;
      const latestBackup = backups.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
      const payload = {
        schemaVersion: 1,
        product: "Minarva Biz",
        generatedAt: new Date().toISOString(),
        app: {
          version,
          platform: api.platform,
          userAgent: navigator.userAgent,
          language: navigator.language,
        },
        database: {
          sqliteFilePresent: sqliteExists,
          sqliteBytesInMemory: sqliteBinary?.byteLength ?? 0,
          backupCount: backups.length,
          verifiedBackupCount: verifiedBackups,
          automaticBackupCount: automaticBackups,
          manualBackupCount: manualBackups,
          latestBackup: latestBackup
            ? { createdAt: latestBackup.createdAt, sizeBytes: latestBackup.sizeBytes, kind: latestBackup.kind, verified: latestBackup.verified }
            : null,
        },
        backupPolicy: {
          enabled: backup.enabled,
          intervalHours: backup.intervalHours,
          retentionCount: backup.retentionCount,
        },
        license: {
          status: license.status,
          plan: license.plan,
          edition: license.edition,
          daysRemaining: license.daysRemaining,
          graceDaysRemaining: license.graceDaysRemaining,
          reason: license.reason ?? null,
        },
        privacy: {
          redacted: true,
          excluded: ["customer names", "phone numbers", "email addresses", "GSTIN", "business address", "license token", "device ID", "database contents"],
        },
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      anchor.href = url;
      anchor.download = `minarvabiz-diagnostics-${stamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setDiagnosticState("done");
      setDiagnosticMessage("Redacted diagnostics exported. No customer records or database contents were included.");
    } catch (error) {
      setDiagnosticState("error");
      setDiagnosticMessage(error instanceof Error ? error.message : "Unable to export diagnostics.");
    }
  }

  return <div className="space-y-6">
    <div><h2 className="text-2xl font-semibold text-slate-900">Business Settings</h2><p className="mt-1 text-sm text-slate-500">Configure your business identity, invoices, tax, backup and application appearance.</p></div>
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-semibold text-slate-900">Business profile</h3><div className="mt-4 grid gap-4 md:grid-cols-2">
      <FormField label="Business / trade name"><input className={inputClass} value={draftProfile.shopName} onChange={e => setDraftProfile({ ...draftProfile, shopName: e.target.value })} /></FormField>
      <FormField label="Registered legal name"><input className={inputClass} value={draftProfile.legalName} onChange={e => setDraftProfile({ ...draftProfile, legalName: e.target.value })} placeholder="As shown on GST / registration" /></FormField>
      <FormField label="Document code"><input className={inputClass} maxLength={8} value={draftProfile.documentCode} onChange={e => setDraftProfile({ ...draftProfile, documentCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="Auto from business name, e.g. MT" /></FormField>
      <FormField label="GSTIN"><input className={inputClass} maxLength={15} value={draftProfile.gstin} onChange={e => setDraftProfile({ ...draftProfile, gstin: e.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="15-character GSTIN" /></FormField>
      <FormField label="Address line 1" className="md:col-span-2"><input className={inputClass} value={draftProfile.address} onChange={e => setDraftProfile({ ...draftProfile, address: e.target.value })} /></FormField>
      <FormField label="Address line 2" className="md:col-span-2"><input className={inputClass} value={draftProfile.addressLine2} onChange={e => setDraftProfile({ ...draftProfile, addressLine2: e.target.value })} /></FormField>
      <FormField label="District / city"><input className={inputClass} value={draftProfile.district} onChange={e => setDraftProfile({ ...draftProfile, district: e.target.value })} /></FormField>
      <FormField label="State / province"><input className={inputClass} value={draftProfile.state} onChange={e => setDraftProfile({ ...draftProfile, state: e.target.value })} /></FormField>
      <FormField label="Country"><input className={inputClass} value={draftProfile.country} onChange={e => setDraftProfile({ ...draftProfile, country: e.target.value })} /></FormField>
      <FormField label="Postal / PIN code"><input className={inputClass} value={draftProfile.postalCode} onChange={e => setDraftProfile({ ...draftProfile, postalCode: e.target.value })} /></FormField>
      <FormField label="Phone"><input className={inputClass} value={draftProfile.phone} onChange={e => setDraftProfile({ ...draftProfile, phone: e.target.value })} /></FormField>
      <FormField label="Email"><input className={inputClass} type="email" value={draftProfile.email} onChange={e => setDraftProfile({ ...draftProfile, email: e.target.value })} /></FormField>
      <FormField label="Website"><input className={inputClass} value={draftProfile.website} onChange={e => setDraftProfile({ ...draftProfile, website: e.target.value })} placeholder="https://…" /></FormField>
      <FormField label="Currency"><select className={selectClass} value={draftProfile.currency} onChange={e => setDraftProfile({ ...draftProfile, currency: e.target.value })}><option value="INR">INR — Indian Rupee</option><option value="OMR">OMR — Omani Rial</option><option value="AED">AED — UAE Dirham</option><option value="USD">USD — US Dollar</option></select></FormField>
      <FormField label="Receipt footer" className="md:col-span-2"><input className={inputClass} value={draftProfile.receiptFooter} onChange={e => setDraftProfile({ ...draftProfile, receiptFooter: e.target.value })} /></FormField>
    </div><div className="mt-5 flex justify-end"><Button onClick={() => onSaveProfile(draftProfile)}>Save business profile</Button></div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-semibold text-slate-900">Tax / GST</h3><div className="mt-4 grid gap-4 md:grid-cols-2">
      <FormField label="GST enabled"><select className={selectClass} value={draftTax.enableGst ? "yes" : "no"} onChange={e => setDraftTax({ ...draftTax, enableGst: e.target.value === "yes" })}><option value="yes">Enabled</option><option value="no">Disabled</option></select></FormField>
      <FormField label="Default GST rate (%)"><input className={inputClass} type="number" min="0" max="100" step="0.01" value={draftTax.defaultRatePercent} onChange={e => setDraftTax({ ...draftTax, defaultRatePercent: Number(e.target.value) || 0 })} /></FormField>
    </div><div className="mt-5 flex justify-end"><Button onClick={() => onSaveTax(draftTax)}>Save tax settings</Button></div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div><h3 className="text-lg font-semibold text-slate-900">Printer settings</h3><p className="mt-1 text-sm text-slate-500">Choose invoice, thermal and barcode-label printers. Desktop printing uses the native Windows print bridge, so bills and labels are not blocked by popup security.</p></div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FormField label="Default invoice paper"><select className={selectClass} value={draftPrinting.defaultInvoicePaper} onChange={e => setDraftPrinting({ ...draftPrinting, defaultInvoicePaper: e.target.value as "a4" | "thermal" })}><option value="a4">A4</option><option value="thermal">Thermal</option></select></FormField>
        <FormField label="Thermal receipt width"><select className={selectClass} value={draftPrinting.thermalWidthMm} onChange={e => setDraftPrinting({ ...draftPrinting, thermalWidthMm: Number(e.target.value) === 58 ? 58 : 80 })}><option value={80}>80 mm</option><option value={58}>58 mm</option></select></FormField>
        <FormField label="A4 printer"><select className={selectClass} value={draftPrinting.a4PrinterName} onChange={e => setDraftPrinting({ ...draftPrinting, a4PrinterName: e.target.value })}><option value="">Use Windows print dialog/default printer</option>{printers.map(p => <option key={`a4-${p.name}`} value={p.name}>{p.displayName}{p.isDefault ? " — Default" : ""}</option>)}</select></FormField>
        <FormField label="Thermal printer"><select className={selectClass} value={draftPrinting.thermalPrinterName} onChange={e => setDraftPrinting({ ...draftPrinting, thermalPrinterName: e.target.value })}><option value="">Use Windows print dialog/default printer</option>{printers.map(p => <option key={`th-${p.name}`} value={p.name}>{p.displayName}{p.isDefault ? " — Default" : ""}</option>)}</select></FormField>
        <FormField label="Barcode label printer"><select className={selectClass} value={draftPrinting.labelPrinterName} onChange={e => setDraftPrinting({ ...draftPrinting, labelPrinterName: e.target.value })}><option value="">Use thermal printer / Windows dialog</option>{printers.map(p => <option key={`label-${p.name}`} value={p.name}>{p.displayName}{p.isDefault ? " — Default" : ""}</option>)}</select></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Label width (mm)"><input className={inputClass} type="number" min="20" max="120" value={draftPrinting.labelWidthMm} onChange={e => setDraftPrinting({ ...draftPrinting, labelWidthMm: Math.max(20, Math.min(120, Number(e.target.value) || 50)) })} /></FormField>
          <FormField label="Label height (mm)"><input className={inputClass} type="number" min="15" max="150" value={draftPrinting.labelHeightMm} onChange={e => setDraftPrinting({ ...draftPrinting, labelHeightMm: Math.max(15, Math.min(150, Number(e.target.value) || 30)) })} /></FormField>
        </div>
        <FormField label="Label code"><select className={selectClass} value={draftPrinting.labelCodeMode} onChange={e => setDraftPrinting({ ...draftPrinting, labelCodeMode: e.target.value as "barcode" | "qr" | "both" })}><option value="both">Barcode + QR</option><option value="barcode">Barcode only</option><option value="qr">QR only</option></select></FormField>
        <FormField label="Windows direct print"><select className={selectClass} value={draftPrinting.silentDesktopPrint ? "yes" : "no"} onChange={e => setDraftPrinting({ ...draftPrinting, silentDesktopPrint: e.target.value === "yes" })}><option value="no">Show Windows print dialog</option><option value="yes">Direct print to selected printer</option></select></FormField>
      </div>
      <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">{printers.length ? `${printers.length} Windows printer(s) detected.` : "Printer discovery is available in the Windows desktop edition. Web browsers use their normal print dialog."}</div>
      {printTestMessage && <p className={`mt-3 text-sm ${printTestState === "error" ? "text-red-600" : printTestState === "done" ? "text-emerald-600" : "text-slate-600"}`}>{printTestMessage}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={testSelectedPrinter} disabled={printTestState === "working"}>{printTestState === "working" ? "Printing test…" : "Test invoice printer"}</Button>
        <Button type="button" variant="outline" onClick={testLabelPrinter} disabled={printTestState === "working"}>Test label printer</Button>
        <Button onClick={() => onSavePrinting(draftPrinting)}>Save printer settings</Button>
      </div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-semibold text-slate-900">Automatic backup</h3><div className="mt-4 grid gap-4 md:grid-cols-3">
      <FormField label="Automatic backup"><select className={selectClass} value={draftBackup.enabled ? "yes" : "no"} onChange={e => setDraftBackup({ ...draftBackup, enabled: e.target.value === "yes" })}><option value="yes">Enabled</option><option value="no">Disabled</option></select></FormField>
      <FormField label="Interval (hours)"><input className={inputClass} type="number" min="1" value={draftBackup.intervalHours} onChange={e => setDraftBackup({ ...draftBackup, intervalHours: Math.max(1, Number(e.target.value) || 24) })} /></FormField>
      <FormField label="Retention count"><input className={inputClass} type="number" min="5" value={draftBackup.retentionCount} onChange={e => setDraftBackup({ ...draftBackup, retentionCount: Math.max(5, Number(e.target.value) || 14) })} /></FormField>
    </div>
    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-medium text-slate-800">Backup folder</div><div className="mt-1 break-all text-xs text-slate-500">{draftBackup.destinationPath || "Default: D:\\Minarva Biz Backups when D: drive is available"}</div></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={useDriveDBackup}>Use D: Drive</Button><Button type="button" variant="outline" onClick={chooseBackupLocation}>Choose Folder</Button></div></div></div>{diagnosticMessage && <p className={`mt-3 text-sm ${diagnosticState === "error" ? "text-red-600" : "text-emerald-600"}`}>{diagnosticMessage}</p>}<div className="mt-5 flex justify-end"><Button onClick={() => onSaveBackup(draftBackup)}>Save backup settings</Button></div></section>
    <PrintTemplateManager
      selection={{
        invoiceA4TemplateId: draftPrinting.invoiceA4TemplateId,
        invoiceThermalTemplateId: draftPrinting.invoiceThermalTemplateId,
        quotationA4TemplateId: draftPrinting.quotationA4TemplateId,
        quotationThermalTemplateId: draftPrinting.quotationThermalTemplateId,
      }}
      onSelectionChange={(patch) => {
        setDraftPrinting((previous) => ({ ...previous, ...patch }));
        onSavePrinting(patch);
      }}
    />
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div><h3 className="text-lg font-semibold text-slate-900">Appearance</h3><p className="mt-1 text-sm text-slate-500">Choose a professional workspace theme. Your choice is remembered on this computer.</p></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {THEMES.map((item) => (
          <button key={item.id} type="button" onClick={() => selectTheme(item.id)} aria-pressed={theme === item.id} className={`group rounded-2xl border p-3 text-left transition ${theme === item.id ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200 hover:border-slate-300"}`}>
            <span className={`block h-20 rounded-xl ${item.preview} ${item.id === "light" ? "border border-slate-200" : ""}`}>
              <span className="block p-3"><span className={`block h-2 w-16 rounded ${item.id === "light" ? "bg-slate-300" : "bg-white/70"}`}/><span className={`mt-2 block h-5 w-full rounded ${item.id === "light" ? "bg-slate-100" : "bg-white/15"}`}/></span>
            </span>
            <span className="mt-3 block text-sm font-semibold text-slate-900">{item.name}</span>
            <span className="mt-1 block text-xs text-slate-500">{item.description}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"><div><div className="text-sm font-medium text-slate-800">Current theme</div><div className="text-xs text-slate-500">{THEMES.find((item) => item.id === theme)?.name}</div></div><Button variant="outline" onClick={() => selectTheme("light")}>Reset to Light</Button></div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h3 className="text-lg font-semibold text-slate-900">Software updates</h3><p className="mt-1 max-w-2xl text-sm text-slate-500">Optional secure Windows updates. Minarva Biz verifies a signed manifest and installer SHA-256 before download/install. Updates are never forced and installation is blocked unless a verified database backup can be created.</p></div>
        <Button variant="outline" onClick={checkUpdates} disabled={updateState === "checking" || updateState === "downloading"}>{updateState === "checking" ? "Checking…" : "Check for updates"}</Button>
      </div>
      {updateMessage && <p className={`mt-4 text-sm ${updateState === "error" ? "text-red-600" : updateState === "available" || updateState === "ready" ? "text-blue-700" : "text-slate-600"}`}>{updateMessage}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {updateState === "available" && <Button onClick={downloadUpdate}>Download & verify {updateVersion || "update"}</Button>}
        {updateState === "ready" && <Button onClick={installUpdate}>Install update safely</Button>}
      </div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h3 className="text-lg font-semibold text-slate-900">Support diagnostics</h3><p className="mt-1 max-w-2xl text-sm text-slate-500">Export a redacted health report for support. Customer records, database contents, license tokens and device IDs are excluded.</p></div>
        <Button variant="outline" onClick={exportDiagnostics} disabled={diagnosticState === "working"}>{diagnosticState === "working" ? "Preparing…" : "Export diagnostics"}</Button>
      </div>
      {diagnosticMessage && <p className={`mt-4 text-sm ${diagnosticState === "error" ? "text-red-600" : "text-emerald-600"}`}>{diagnosticMessage}</p>}
    </section>
  </div>;
}
