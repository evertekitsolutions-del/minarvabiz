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
  const [steps, setSteps] = React.useState(() => getOnboardingSteps());
  const [scopeKey, setScopeKey] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const user = getSessionUser();
    const scope = onboardingPreferenceKey(
      user?.id ?? null,
      phase9Store.getActiveBranch()?.id ?? null,
      getRuntimeMode() === "demo",
    );
    setScopeKey(scope);
    function reload() {
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
    const onStorage = (event: StorageEvent) => {
      if (event.key === scope || event.key === null) reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
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
      </header>
      {error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {steps.map(s => (
        <Card key={s.id}>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">{s.title}</div>
              <div className="text-xs text-slate-500">{s.done ? "Confirmed by you" : "Not confirmed"}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => router.push(s.href)}>Open</Button>
              <Button size="sm" disabled={!loaded || !scopeKey} variant={s.done ? "outline" : "default"}
                onClick={() => setConfirmation(s.id, !s.done)}>
                {s.done ? "Undo confirmation" : "I completed this"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
