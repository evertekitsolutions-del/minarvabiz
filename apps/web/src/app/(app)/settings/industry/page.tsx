"use client";

import * as React from "react";
import { getRuntimeMode, getSessionUser, phase9Store } from "@minarvabiz/business-logic";
import {
  buildIndustryProfile, industryPreferenceKey, listIndustryPacks,
  readIndustryProfile, writeIndustryProfile, listIndustryWorkflowTemplates,
  saveIndustryIntakeDraft, readIndustryIntakeDraft,
  type IndustryPackId, type IndustryWorkspaceProfile,
} from "@minarvabiz/business-logic";

const packs = listIndustryPacks();

/**
 * Industry-specific intake field examples are presentation-only. These do not
 * write to shared catalog/customer tables or authorize an industry module.
 * Each optional pack owns its own vocabulary and required input examples.
 */
const intakeFields: Record<IndustryPackId, readonly { key: string; label: string; hint: string }[]> = {
  retail: [{ key: "returnReason", label: "Return reason", hint: "Damaged packaging" }],
  wholesale: [{ key: "purchaseOrderRef", label: "Buyer PO reference", hint: "PO-2026-001" }],
  restaurant: [{ key: "tableRef", label: "Table / takeaway reference", hint: "Table 4" }],
  pharmacy: [{ key: "prescriptionRef", label: "Prescription reference", hint: "Reference only; no patient details" }],
  garments: [{ key: "variantRef", label: "Size / colour variant reference", hint: "M / Navy" }],
  salon: [{ key: "appointmentRef", label: "Appointment reference", hint: "Booking number" }],
  professional: [{ key: "engagementRef", label: "Engagement reference", hint: "Client project code" }],
  repair: [{ key: "deviceRef", label: "Device / service reference", hint: "Job card reference" }],
  manufacturing: [{ key: "workOrderRef", label: "Work order reference", hint: "WO-001" }],
  tailoring: [{ key: "measurementRef", label: "Measurement sheet reference", hint: "Sheet reference" }],
  laundry: [{ key: "garmentTagRef", label: "Garment tag reference", hint: "Tag number" }],
};

/**
 * Operator-local industry workspace preferences. These do not activate licensed
 * modules, modify shared records, or imply the listed workflows are implemented.
 */
export default function IndustryWorkspacePage() {
  const [scope, setScope] = React.useState<string | null>(null);
  const [profile, setProfile] = React.useState<IndustryWorkspaceProfile>({ version: 1, primary: null, enabled: [] });
  const [loaded, setLoaded] = React.useState(false);
  const baselineRef = React.useRef<string | null>(null);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [previewStages, setPreviewStages] = React.useState<Record<string, number>>({});
  const [intakePreview, setIntakePreview] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    function load() {
      const user = getSessionUser();
      const key = industryPreferenceKey(
        user?.id ?? null,
        phase9Store.getActiveBranch()?.id ?? null,
        getRuntimeMode() === "demo",
      );
      setScope(key);
      baselineRef.current = null;
      setPreviewStages({});
      setIntakePreview({});
      setMessage("");
      try {
        const saved = key ? readIndustryProfile(window.localStorage, key) : { version: 1 as const, primary: null, enabled: [] };
        setProfile(saved);
        baselineRef.current = key ? JSON.stringify(saved) : null;
        setError(key ? "" : "Sign in and select a branch before saving preferences.");
      } catch {
        setProfile({ version: 1, primary: null, enabled: [] });
        setError("Saved preferences are invalid or unavailable. No industry packs have been enabled.");
      }
      setLoaded(true);
    }
    load();
    window.addEventListener("minarva:data-hydrated", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("minarva:data-hydrated", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  function toggle(id: IndustryPackId, checked: boolean) {
    const enabled = checked ? [...profile.enabled, id] : profile.enabled.filter(pack => pack !== id);
    const primary = profile.primary && enabled.includes(profile.primary) ? profile.primary : null;
    setProfile(buildIndustryProfile(primary, enabled));
    setMessage("");
    setPreviewStages({});
    setIntakePreview({});
  }

  function save() {
    if (!scope) return;
    // A branch/session can change without a hydration event while this form is open.
    // Never persist the previous operator's draft under a stale scope.
    const user = getSessionUser();
    const currentScope = industryPreferenceKey(
      user?.id ?? null,
      phase9Store.getActiveBranch()?.id ?? null,
      getRuntimeMode() === "demo",
    );
    if (currentScope !== scope) {
      setScope(currentScope);
      baselineRef.current = null;
      setProfile({ version: 1, primary: null, enabled: [] });
      setPreviewStages({});
      setError("User, branch or runtime changed. Reload this page before saving.");
      setMessage("");
      return;
    }
    try {
      // Refuse to overwrite a newer preference written by another tab or host.
      // Storage events can be delayed while a background tab is suspended.
      const latest = JSON.stringify(readIndustryProfile(window.localStorage, scope));
      if (baselineRef.current === null || latest !== baselineRef.current) {
        setError("Preferences changed in another tab. Reload before saving to avoid overwriting them.");
        setMessage("");
        return;
      }
      const next = buildIndustryProfile(profile.primary, profile.enabled);
      writeIndustryProfile(window.localStorage, scope, next);
      // A storage adapter can acknowledge setItem without retaining the value.
      // Confirm a scoped readback before reporting a saved preference.
      const persisted = readIndustryProfile(window.localStorage, scope);
      if (JSON.stringify(persisted) !== JSON.stringify(next)) {
        throw new Error("Industry preference readback mismatch");
      }
      setProfile(persisted);
      baselineRef.current = JSON.stringify(persisted);
      setError("");
      setMessage("Industry workspace preferences saved for this browser, user and branch.");
    } catch {
      setError("Could not save industry preferences. Check browser storage permissions or quota.");
      setMessage("");
    }
  }


  function saveReference(templateId: string, fieldKey: string, restore: boolean) {
    if (!scope) return;
    const user = getSessionUser();
    if (industryPreferenceKey(user?.id ?? null, phase9Store.getActiveBranch()?.id ?? null, getRuntimeMode() === "demo") !== scope) {
      setError("Workspace changed. Reload before accessing drafts.");
      return;
    }
    try {
      // Drafts belong only to a saved, still-current workspace selection.
      // An unsaved pack toggle must not create a draft for an uncommitted profile.
      const savedProfile = readIndustryProfile(window.localStorage, scope);
      const currentProfile = JSON.stringify(buildIndustryProfile(profile.primary, profile.enabled));
      if (baselineRef.current === null ||
          JSON.stringify(savedProfile) !== baselineRef.current ||
          currentProfile !== baselineRef.current) {
        setMessage("");
        setError("Industry selection has unsaved or conflicting changes. Save or reload preferences before accessing drafts.");
        return;
      }
      if (restore) {
        const draft = readIndustryIntakeDraft(window.localStorage, scope, profile, templateId);
        if (!draft) { setMessage("No local reference draft found."); return; }
        setIntakePreview(previous => ({ ...previous, [templateId + ":" + fieldKey]: draft.reference }));
      } else {
        saveIndustryIntakeDraft(window.localStorage, scope, profile, templateId,
          intakePreview[templateId + ":" + fieldKey] ?? "", new Date().toISOString());
      }
      setError("");
      setMessage(restore ? "Local reference restored." : "Local reference saved. No transaction created.");
    } catch {
      setMessage("");
      setError("Draft unavailable. Use a reference code up to 64 characters and check browser storage.");
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">Industry workspace preferences</h1>
        <p className="text-sm text-slate-600">
          Choose relevant business types without forcing boutique or any other industry on every company.
          This is a browser-local workspace preference, not a module entitlement or shared company configuration.
          Listed capabilities are planning labels and do not certify that every workflow is available.
        </p>
      </header>
      {error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <fieldset disabled={!loaded || !scope} className="space-y-3">
        <legend className="mb-3 font-medium">Optional industry packs</legend>
        {packs.map(pack => (
          <label key={pack.id} className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-white p-3">
            <input type="checkbox" className="mt-1 size-4" checked={profile.enabled.includes(pack.id)}
              onChange={event => toggle(pack.id, event.target.checked)} />
            <span><span className="block font-medium">{pack.label}</span>
              <span className="text-xs text-slate-600">Relevant workflows: {pack.modules.join(", ")}</span>
            </span>
          </label>
        ))}
        <label className="block text-sm font-medium">
          Primary industry
          <select className="mt-2 block w-full rounded-lg border border-slate-300 bg-white p-2"
            value={profile.primary ?? ""} onChange={event => setProfile(buildIndustryProfile(
              event.target.value ? event.target.value as IndustryPackId : null, profile.enabled,
            ))}>
            <option value="">None / mixed business</option>
            {packs.filter(pack => profile.enabled.includes(pack.id)).map(pack =>
              <option key={pack.id} value={pack.id}>{pack.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={save}
          className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          Save preferences
        </button>
      </fieldset>
      <section aria-label="Industry workflow examples" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Selected industry workflow examples</h2>
        <p className="text-xs text-slate-600">Interactive, in-memory workflow previews only. They do not create orders, persist events, enable modules, grant permissions or change customer records.</p>
        {listIndustryWorkflowTemplates(profile).length === 0 ? (
          <p className="text-sm text-slate-600">Select an optional industry to preview its typical workflow.</p>
        ) : (
          <ul className="space-y-3">
            {listIndustryWorkflowTemplates(profile).map(template => (
              <li key={template.id} className="rounded-md bg-slate-50 p-3">
                <div className="text-sm font-medium">{template.label}</div>
                <div className="mt-1 text-xs text-slate-600">{template.stages.join(" → ")}</div>
                <div className="mt-3 space-y-2">
                  {intakeFields[template.industry].map(field => (
                    <label key={field.key} className="block text-xs font-medium">
                      {field.label} (preview only)
                      <input type="text" maxLength={120} autoComplete="off"
                        className="mt-1 block w-full rounded border border-slate-300 bg-white p-2"
                        placeholder={field.hint}
                        value={intakePreview[`${template.id}:${field.key}`] ?? ""}
                        onChange={event => setIntakePreview(previous => ({
                          ...previous, [`${template.id}:${field.key}`]: event.target.value,
                        }))} />
                    </label>
                  ))}
                  <div className="flex gap-3 text-xs">
                    <button type="button" disabled={!scope} onClick={() => saveReference(template.id, intakeFields[template.industry][0].key, false)} className="rounded border px-2 py-1">Save reference draft</button>
                    <button type="button" disabled={!scope} onClick={() => saveReference(template.id, intakeFields[template.industry][0].key, true)} className="underline">Restore local draft</button>
                  </div>
                  <p className="text-xs text-slate-500">Browser-local reference draft only — no customer transaction, workflow event or server write.</p>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <span aria-live="polite">Preview stage: {template.stages[previewStages[template.id] ?? 0]}</span>
                  <button type="button" className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                    disabled={(previewStages[template.id] ?? 0) >= template.stages.length - 1}
                    onClick={() => setPreviewStages(previous => ({ ...previous, [template.id]: Math.min((previous[template.id] ?? 0) + 1, template.stages.length - 1) }))}>
                    Preview next stage
                  </button>
                  <button type="button" className="underline disabled:opacity-40"
                    disabled={(previewStages[template.id] ?? 0) === 0}
                    onClick={() => setPreviewStages(previous => ({ ...previous, [template.id]: 0 }))}>Reset preview</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
    </main>
  );
}
