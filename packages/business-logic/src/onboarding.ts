/** First-run onboarding checklist */
export interface OnboardingStep {
  id: string;
  title: string;
  done: boolean;
  href: string;
}

let completed = new Set<string>();

export function getOnboardingSteps(): OnboardingStep[] {
  const steps = [
    { id: "shop", title: "Set shop profile", href: "/settings" },
    { id: "products", title: "Add products", href: "/products" },
    { id: "customers", title: "Add customers", href: "/customers" },
    { id: "license", title: "Activate license", href: "/license" },
    { id: "backup", title: "Create first backup", href: "/backup" },
  ];
  return steps.map((s) => ({ ...s, done: completed.has(s.id) }));
}

export function markOnboardingDone(id: string) {
  completed.add(id);
}

export function isOnboardingComplete(): boolean {
  return getOnboardingSteps().every((s) => s.done);
}

export function hydrateOnboarding(ids: string[]) {
  completed = new Set(ids);
}

export function exportOnboardingIds(): string[] {
  return [...completed];
}
