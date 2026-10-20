/** Durable, user-confirmed first-customer setup checklist.
 *
 * This is a checklist of user confirmations, NOT independent commercial UAT.
 * Completion follows the business domain snapshot into SQLite/backup/export.
 */
import { touchPersistence } from "./autosave";

export interface OnboardingStep {
  id: string;
  title: string;
  done: boolean;
  href: string;
}

const steps = [
  { id: "shop", title: "Set shop profile", href: "/settings" },
  { id: "products", title: "Add products", href: "/products" },
  { id: "customers", title: "Add customers", href: "/customers" },
  { id: "customer-balances", title: "Set customer opening balances", href: "/customers" },
  { id: "suppliers", title: "Add suppliers and opening payables", href: "/suppliers" },
  { id: "license", title: "Activate license", href: "/license" },
  { id: "backup", title: "Create first backup", href: "/backup" },
] as const;
const allowed = new Set<string>(steps.map(s => s.id));
let completed = new Set<string>();

/** Reject malformed/unknown checklist data before importing any snapshot. */
export function validateOnboardingIds(input: unknown): string[] {
  if (!Array.isArray(input) || input.length > allowed.size) {
    throw new Error("Onboarding confirmations must be an array of known step IDs");
  }
  const unique = new Set<string>();
  for (const id of input) {
    if (typeof id !== "string" || !allowed.has(id) || unique.has(id)) {
      throw new Error("Onboarding confirmations contain an unknown or duplicate step");
    }
    unique.add(id);
  }
  return steps.map(s => s.id).filter(id => unique.has(id));
}

export function getOnboardingSteps(): OnboardingStep[] {
  return steps.map(s => ({ ...s, done: completed.has(s.id) }));
}

/** Confirmed by the operator; does not certify that the linked workflow succeeded. */
export function markOnboardingDone(id: string): boolean {
  if (!allowed.has(id)) return false;
  if (completed.has(id)) return true;
  completed.add(id);
  touchPersistence();
  return true;
}

export function unmarkOnboardingDone(id: string): boolean {
  if (!allowed.has(id)) return false;
  if (!completed.delete(id)) return true;
  touchPersistence();
  return true;
}

export function isOnboardingComplete(): boolean {
  return completed.size === allowed.size;
}

export function hydrateOnboarding(ids: string[]): void {
  completed = new Set(validateOnboardingIds(ids));
}

export function exportOnboardingIds(): string[] {
  return steps.map(s => s.id).filter(id => completed.has(id));
}
