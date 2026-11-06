"use client";

import * as React from "react";
import { getRuntimeMode, getSessionUser, phase9Store } from "@minarvabiz/business-logic";
import {
  buildIndustryProfile, industryPreferenceKey, listIndustryPacks,
  readIndustryProfile, writeIndustryProfile, listIndustryWorkflowTemplates,
  type IndustryPackId, type IndustryWorkspaceProfile,
} from "@minarvabiz/business-logic";

const packs = listIndustryPacks();

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
