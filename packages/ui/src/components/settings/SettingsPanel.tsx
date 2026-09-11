import * as React from "react";
import { Button } from "../Button";
import { FormField, inputClass, selectClass } from "../forms/FormField";

export interface SettingsPanelProps {
  profile: { shopName: string; address: string; phone: string; email: string; gstin: string; receiptFooter: string; currency: string };
  tax: { enableGst: boolean; defaultRatePercent: number };
  backup: { enabled: boolean; intervalHours: number; retentionCount: number };
  onSaveProfile: (patch: Partial<SettingsPanelProps["profile"]>) => void;
  onSaveTax: (patch: Partial<SettingsPanelProps["tax"]>) => void;
  onSaveBackup: (patch: Partial<SettingsPanelProps["backup"]>) => void;
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
  getLicenseState: () => Promise<{ status: string; plan: string | null; edition: string | null; daysRemaining: number | null; graceDaysRemaining: number | null; reason?: string }>;
};

function getDiagnosticsApi(): DesktopDiagnosticsApi | null {
  return (window as unknown as { minarvaDesktop?: DesktopDiagnosticsApi }).minarvaDesktop ?? null;
}

export function SettingsPanel({ profile, tax, backup, onSaveProfile, onSaveTax, onSaveBackup }: SettingsPanelProps) {
  const [draftProfile, setDraftProfile] = React.useState(profile);
  const [draftTax, setDraftTax] = React.useState(tax);
  const [draftBackup, setDraftBackup] = React.useState(backup);
  const [theme, setTheme] = React.useState<ThemeId>(readTheme);
  const [diagnosticState, setDiagnosticState] = React.useState<"idle" | "working" | "done" | "error">("idle");
  const [diagnosticMessage, setDiagnosticMessage] = React.useState("");
  React.useEffect(() => setDraftProfile(profile), [profile]);
  React.useEffect(() => setDraftTax(tax), [tax]);
  React.useEffect(() => setDraftBackup(backup), [backup]);
  React.useEffect(() => applyTheme(theme), [theme]);

  function selectTheme(next: ThemeId) {
    setTheme(next);
    applyTheme(next);
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
      <FormField label="Business name"><input className={inputClass} value={draftProfile.shopName} onChange={e => setDraftProfile({ ...draftProfile, shopName: e.target.value })} /></FormField>
      <FormField label="Phone"><input className={inputClass} value={draftProfile.phone} onChange={e => setDraftProfile({ ...draftProfile, phone: e.target.value })} /></FormField>
      <FormField label="Email"><input className={inputClass} type="email" value={draftProfile.email} onChange={e => setDraftProfile({ ...draftProfile, email: e.target.value })} /></FormField>
      <FormField label="GSTIN"><input className={inputClass} value={draftProfile.gstin} onChange={e => setDraftProfile({ ...draftProfile, gstin: e.target.value.toUpperCase() })} /></FormField>
      <FormField label="Address" className="md:col-span-2"><textarea className={inputClass + " h-auto py-2"} rows={3} value={draftProfile.address} onChange={e => setDraftProfile({ ...draftProfile, address: e.target.value })} /></FormField>
      <FormField label="Currency"><select className={selectClass} value={draftProfile.currency} onChange={e => setDraftProfile({ ...draftProfile, currency: e.target.value })}><option value="INR">INR — Indian Rupee</option><option value="OMR">OMR — Omani Rial</option><option value="AED">AED — UAE Dirham</option><option value="USD">USD — US Dollar</option></select></FormField>
      <FormField label="Receipt footer"><input className={inputClass} value={draftProfile.receiptFooter} onChange={e => setDraftProfile({ ...draftProfile, receiptFooter: e.target.value })} /></FormField>
    </div><div className="mt-5 flex justify-end"><Button onClick={() => onSaveProfile(draftProfile)}>Save business profile</Button></div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-semibold text-slate-900">Tax / GST</h3><div className="mt-4 grid gap-4 md:grid-cols-2">
      <FormField label="GST enabled"><select className={selectClass} value={draftTax.enableGst ? "yes" : "no"} onChange={e => setDraftTax({ ...draftTax, enableGst: e.target.value === "yes" })}><option value="yes">Enabled</option><option value="no">Disabled</option></select></FormField>
      <FormField label="Default GST rate (%)"><input className={inputClass} type="number" min="0" max="100" step="0.01" value={draftTax.defaultRatePercent} onChange={e => setDraftTax({ ...draftTax, defaultRatePercent: Number(e.target.value) || 0 })} /></FormField>
    </div><div className="mt-5 flex justify-end"><Button onClick={() => onSaveTax(draftTax)}>Save tax settings</Button></div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-semibold text-slate-900">Automatic backup</h3><div className="mt-4 grid gap-4 md:grid-cols-3">
      <FormField label="Automatic backup"><select className={selectClass} value={draftBackup.enabled ? "yes" : "no"} onChange={e => setDraftBackup({ ...draftBackup, enabled: e.target.value === "yes" })}><option value="yes">Enabled</option><option value="no">Disabled</option></select></FormField>
      <FormField label="Interval (hours)"><input className={inputClass} type="number" min="1" value={draftBackup.intervalHours} onChange={e => setDraftBackup({ ...draftBackup, intervalHours: Math.max(1, Number(e.target.value) || 24) })} /></FormField>
      <FormField label="Retention count"><input className={inputClass} type="number" min="5" value={draftBackup.retentionCount} onChange={e => setDraftBackup({ ...draftBackup, retentionCount: Math.max(5, Number(e.target.value) || 14) })} /></FormField>
    </div><div className="mt-5 flex justify-end"><Button onClick={() => onSaveBackup(draftBackup)}>Save backup settings</Button></div></section>
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
        <div><h3 className="text-lg font-semibold text-slate-900">Support diagnostics</h3><p className="mt-1 max-w-2xl text-sm text-slate-500">Export a redacted health report for support. Customer records, database contents, license tokens and device IDs are excluded.</p></div>
        <Button variant="outline" onClick={exportDiagnostics} disabled={diagnosticState === "working"}>{diagnosticState === "working" ? "Preparing…" : "Export diagnostics"}</Button>
      </div>
      {diagnosticMessage && <p className={`mt-4 text-sm ${diagnosticState === "error" ? "text-red-600" : "text-emerald-600"}`}>{diagnosticMessage}</p>}
    </section>
  </div>;
}
