"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent } from "@minarvabiz/ui";
import {
  exportOnboardingIds, getOnboardingSteps, getRuntimeMode, getSessionUser,
  hydrateOnboarding, markOnboardingDone, onboardingPreferenceKey,
  phase9Store, readOnboardingPreferences, unmarkOnboardingDone,
  writeOnboardingPreferences,
} from "@minarvabiz/business-logic";

export default function OnboardingPage() {
  const router = useRouter();
  const [steps, setSteps] = React.useState(() => getOnboardingSteps().map(step => ({ ...step, done: false })));
  const [scopeKey, setScopeKey] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [showIncompleteOnly, setShowIncompleteOnly] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let currentScope: string | null = null;
    function reload() {
      const user = getSessionUser();
      const scope = onboardingPreferenceKey(
        user?.id ?? null,
        phase9Store.getActiveBranch()?.id ?? null,
        getRuntimeMode() === "demo",
      );
      currentScope = scope;
      setScopeKey(scope);
      if (!scope) {
        hydrateOnboarding([]);
        setError("A signed-in user and selected branch are required to save setup confirmations.");
      } else {
        try {
          hydrateOnboarding(readOnboardingPreferences(window.localStorage, scope));
          setError(null);
        } catch {
          hydrateOnboarding([]);
          setError("Saved checklist is unavailable or invalid. No steps have been auto-confirmed.");
        }
      }
      setSteps(getOnboardingSteps());
      setLoaded(true);
    }
    reload();
    // Identity/branch may be hydrated after this page's first React effect.
    const onStorage = (event: StorageEvent) => {
      if (event.key === currentScope || event.key === null) reload();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("minarva:data-hydrated", reload);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("minarva:data-hydrated", reload);
    };
  }, []);

  function setConfirmation(id: string, done: boolean) {
    if (!scopeKey) return;
    const confirmations = new Set(exportOnboardingIds());
    if (done) confirmations.add(id);
    else confirmations.delete(id);
    try {
      // Persist first: quota/security errors must not claim a saved milestone.
      writeOnboardingPreferences(window.localStorage, scopeKey, [...confirmations]);
      if (done) markOnboardingDone(id);
      else unmarkOnboardingDone(id);
      setSteps(getOnboardingSteps());
      setError(null);
    } catch {
      setError("Could not save your checklist. Browser storage may be disabled or full.");
    }
  }

  const completed = steps.filter(step => step.done).length;
  const completionPercent = steps.length ? Math.round((completed / steps.length) * 100) : 0;
  const visibleSteps = (loaded ? steps : []).filter(s => (!showIncompleteOnly || !s.done) && s.title.toLowerCase().includes(searchQuery.trim().toLowerCase()));
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">First customer setup</h1>
        <p className="text-sm text-slate-600">
          Open each workflow and confirm it after completing it. Confirmations
          are saved only for this signed-in user and branch on this browser.
          They are not proof of successful customer UAT, licensing or backup.
        </p>
        <p aria-live="polite" className="text-sm font-medium">
          {loaded ? `${completed} of ${steps.length} steps confirmed` : "Loading checklist…"}
        </p>
        <div role="progressbar" aria-label="Setup checklist progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completionPercent} className="h-3 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-indigo-600 transition-[width]" style={{ width: `${completionPercent}%` }} />
        </div>
        <p className="text-xs text-slate-600">{completionPercent}% of this browser checklist confirmed — not deployment or product readiness.</p>
      </header>
      <label className="block text-sm font-medium text-slate-700">Search setup steps<input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Find a setup task" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
      <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={showIncompleteOnly} onChange={(event) => setShowIncompleteOnly(event.target.checked)} className="size-4 accent-indigo-600" />Show incomplete steps only</label>
      {error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {visibleSteps.map(s => (
        <Card key={s.id}>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">{s.title}</div>
              <div className="text-xs text-slate-500">{s.done ? "Confirmed by you" : "Not confirmed"}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => router.push(s.href)}>Open</Button>
              <Button size="sm" disabled={!loaded || !scopeKey} variant={s.done ? "outline" : "primary"}
                onClick={() => setConfirmation(s.id, !s.done)}>
                {s.done ? "Undo confirmation" : "I completed this"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {loaded && visibleSteps.length === 0 && searchQuery.trim() && <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">No setup steps match your search. <button type="button" className="font-semibold underline" onClick={() => { setSearchQuery(""); setShowIncompleteOnly(false); }}>Clear filters</button></p>}
      {loaded && showIncompleteOnly && !searchQuery.trim() && completed === steps.length && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">All checklist steps have been confirmed in this browser.</p>}
    </div>
  );
}
