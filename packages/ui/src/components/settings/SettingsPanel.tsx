import * as React from "react";
import { Button } from "../Button";
import { FormField } from "../FormField";
import { inputClass, selectClass } from "../../styles";

export interface SettingsPanelProps {
  profile: {
    shopName: string;
    address: string;
    phone: string;
    email: string;
    gstin: string;
    receiptFooter: string;
    currency: string;
  };
  tax: {
    enableGst: boolean;
    defaultRatePercent: number;
  };
  backup: {
    enabled: boolean;
    intervalHours: number;
    retentionCount: number;
  };
  onSaveProfile: (patch: Partial<SettingsPanelProps["profile"]>) => void;
  onSaveTax: (patch: Partial<SettingsPanelProps["tax"]>) => void;
  onSaveBackup: (patch: Partial<SettingsPanelProps["backup"]>) => void;
}

export function SettingsPanel({ profile, tax, backup, onSaveProfile, onSaveTax, onSaveBackup }: SettingsPanelProps) {
  const [draftProfile, setDraftProfile] = React.useState(profile);
  const [draftTax, setDraftTax] = React.useState(tax);
  const [draftBackup, setDraftBackup] = React.useState(backup);
  React.useEffect(() => setDraftProfile(profile), [profile]);
  React.useEffect(() => setDraftTax(tax), [tax]);
  React.useEffect(() => setDraftBackup(backup), [backup]);

  return <div className="space-y-6">
    <div><h2 className="text-2xl font-semibold text-slate-900">Business Settings</h2><p className="mt-1 text-sm text-slate-500">Configure your business identity, invoices, tax and automatic backups.</p></div>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Business profile</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FormField label="Business name"><input className={inputClass} value={draftProfile.shopName} onChange={e => setDraftProfile({ ...draftProfile, shopName: e.target.value })} /></FormField>
        <FormField label="Phone"><input className={inputClass} value={draftProfile.phone} onChange={e => setDraftProfile({ ...draftProfile, phone: e.target.value })} /></FormField>
        <FormField label="Email"><input className={inputClass} type="email" value={draftProfile.email} onChange={e => setDraftProfile({ ...draftProfile, email: e.target.value })} /></FormField>
        <FormField label="GSTIN"><input className={inputClass} value={draftProfile.gstin} onChange={e => setDraftProfile({ ...draftProfile, gstin: e.target.value.toUpperCase() })} /></FormField>
        <div className="md:col-span-2"><FormField label="Address"><textarea className={inputClass} rows={3} value={draftProfile.address} onChange={e => setDraftProfile({ ...draftProfile, address: e.target.value })} /></FormField></div>
        <FormField label="Currency"><select className={selectClass} value={draftProfile.currency} onChange={e => setDraftProfile({ ...draftProfile, currency: e.target.value })}><option value="INR">INR — Indian Rupee</option><option value="OMR">OMR — Omani Rial</option><option value="AED">AED — UAE Dirham</option><option value="USD">USD — US Dollar</option></select></FormField>
        <FormField label="Receipt footer"><input className={inputClass} value={draftProfile.receiptFooter} onChange={e => setDraftProfile({ ...draftProfile, receiptFooter: e.target.value })} /></FormField>
      </div>
      <div className="mt-5 flex justify-end"><Button onClick={() => onSaveProfile(draftProfile)}>Save business profile</Button></div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Tax / GST</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FormField label="GST enabled"><select className={selectClass} value={draftTax.enableGst ? "yes" : "no"} onChange={e => setDraftTax({ ...draftTax, enableGst: e.target.value === "yes" })}><option value="yes">Enabled</option><option value="no">Disabled</option></select></FormField>
        <FormField label="Default GST rate (%)"><input className={inputClass} type="number" min="0" max="100" step="0.01" value={draftTax.defaultRatePercent} onChange={e => setDraftTax({ ...draftTax, defaultRatePercent: Number(e.target.value) || 0 })} /></FormField>
      </div>
      <div className="mt-5 flex justify-end"><Button onClick={() => onSaveTax(draftTax)}>Save tax settings</Button></div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Automatic backup</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <FormField label="Automatic backup"><select className={selectClass} value={draftBackup.enabled ? "yes" : "no"} onChange={e => setDraftBackup({ ...draftBackup, enabled: e.target.value === "yes" })}><option value="yes">Enabled</option><option value="no">Disabled</option></select></FormField>
        <FormField label="Interval (hours)"><input className={inputClass} type="number" min="1" value={draftBackup.intervalHours} onChange={e => setDraftBackup({ ...draftBackup, intervalHours: Math.max(1, Number(e.target.value) || 24) })} /></FormField>
        <FormField label="Retention count"><input className={inputClass} type="number" min="5" value={draftBackup.retentionCount} onChange={e => setDraftBackup({ ...draftBackup, retentionCount: Math.max(5, Number(e.target.value) || 14) })} /></FormField>
      </div>
      <div className="mt-5 flex justify-end"><Button onClick={() => onSaveBackup(draftBackup)}>Save backup settings</Button></div>
    </section>
  </div>;
}
