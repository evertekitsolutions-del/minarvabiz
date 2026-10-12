/**
 * Browser-only checklist preferences. UI confirmations are scoped per signed-in
 * user and active branch, never used as authoritative licensing/UAT evidence.
 * The production browser must not persist an entire commercial domain snapshot.
 */
import { validateOnboardingIds } from "./onboarding";

export interface OnboardingPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PREFIX = "minarvabiz-onboarding-confirmations-v1";
const IDENTIFIER = /^[a-zA-Z0-9_-]{1,128}$/;

/** No unauthenticated fallback: do not share state across users/tenants. */
export function onboardingPreferenceKey(
  userId: string | null,
  branchId: string | null,
  demoMode = false,
): string | null {
  if (demoMode) return PREFIX + ":demo";
  if (!userId || !IDENTIFIER.test(userId)) return null;
  if (!branchId || !IDENTIFIER.test(branchId)) return null;
  return PREFIX + ":" + userId + ":" + branchId;
}

export function readOnboardingPreferences(
  storage: OnboardingPreferenceStorage,
  key: string,
): string[] {
  if (!key.startsWith(PREFIX + ":")) throw Error("Invalid onboarding scope");
  const raw = storage.getItem(key);
  if (raw === null) return [];
  if (raw.length > 512) throw Error("Onboarding preference is oversized");
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      (data as { version?: unknown }).version !== 1) {
    throw Error("Unsupported onboarding preference format");
  }
  return validateOnboardingIds((data as { ids?: unknown }).ids);
}

export function writeOnboardingPreferences(
  storage: OnboardingPreferenceStorage,
  key: string,
  ids: string[],
): void {
  if (!key.startsWith(PREFIX + ":")) throw Error("Invalid onboarding scope");
  const validated = validateOnboardingIds(ids);
  storage.setItem(key, JSON.stringify({ version: 1, ids: validated }));
}
