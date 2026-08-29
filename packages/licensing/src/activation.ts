/**
 * License activation lifecycle — local storage of signed token + grace tracking.
 * Signing keys never ship in client apps; only public key for verification.
 */

import type {
  LicensePayload, LicensePlan, LicenseFeatures, Edition, UUID,
} from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { PLAN_FEATURES } from "./features";
import { PLAN_LIMITS } from "./limits";
import { validateLicenseLocally, type ValidationResult } from "./validate";

export type LicenseLifecycleStatus =
  | "unlicensed"
  | "trial"
  | "active"
  | "grace"
  | "expired"
  | "invalid";

export interface StoredLicense {
  token: string;
  activatedAt: string;
  lastOnlineValidation: string | null;
  fingerprintHash: string | null;
  plan: LicensePlan;
  edition: Edition;
}

export interface LicenseState {
  status: LicenseLifecycleStatus;
  plan: LicensePlan | null;
  edition: Edition | null;
  features: LicenseFeatures | null;
  daysRemaining: number | null;
  graceDaysRemaining: number | null;
  reason?: string;
  payload: LicensePayload | null;
  stored: StoredLicense | null;
}

/** Dev/demo public key placeholder — replace with real Ed25519 public key in production */
export const DEMO_PUBLIC_KEY_HEX =
  "0000000000000000000000000000000000000000000000000000000000000000";

let stored: StoredLicense | null = null;

export function getStoredLicense(): StoredLicense | null {
  return stored;
}

export function clearLicense(): void {
  stored = null;
}

/**
 * Activate with a signed token (production path).
 * Falls back to invalid if signature fails.
 */
export async function activateWithToken(
  token: string,
  publicKeyHex: string,
  fingerprintHash?: string
): Promise<LicenseState> {
  const result = await validateLicenseLocally(token, publicKeyHex, fingerprintHash, {
    graceDays: 0,
  });
  if (!result.valid || !result.payload) {
    return {
      status: "invalid",
      plan: null,
      edition: null,
      features: null,
      daysRemaining: null,
      graceDaysRemaining: null,
      reason: result.reason,
      payload: result.payload,
      stored: null,
    };
  }
  stored = {
    token,
    activatedAt: nowISO(),
    lastOnlineValidation: nowISO(),
    fingerprintHash: fingerprintHash ?? null,
    plan: result.payload.plan,
    edition: result.payload.edition,
  };
  return evaluateState(result, publicKeyHex, fingerprintHash);
}

/**
 * Start local trial without signed token (first-run experience).
 * Token is a structured local marker — NOT a commercial license.
 */
export function startTrial(edition: Edition = "offline"): LicenseState {
  const expires = new Date();
  expires.setDate(expires.getDate() + PLAN_LIMITS.trial.trialDays);
  stored = {
    token: `trial:${generateId()}`,
    activatedAt: nowISO(),
    lastOnlineValidation: nowISO(),
    fingerprintHash: null,
    plan: "trial",
    edition,
  };
  return {
    status: "trial",
    plan: "trial",
    edition,
    features: PLAN_FEATURES.trial,
    daysRemaining: PLAN_LIMITS.trial.trialDays,
    graceDaysRemaining: null,
    payload: {
      licenseId: generateId() as UUID,
      customerId: generateId() as UUID,
      product: "minarvabiz",
      edition,
      plan: "trial",
      features: PLAN_FEATURES.trial,
      issuedAt: nowISO(),
      expiresAt: expires.toISOString(),
      activationLimit: 1,
      deviceBindings: [],
    },
    stored,
  };
}

export async function evaluateStoredLicense(
  publicKeyHex: string,
  fingerprintHash?: string
): Promise<LicenseState> {
  if (!stored) {
    return {
      status: "unlicensed",
      plan: null,
      edition: null,
      features: null,
      daysRemaining: null,
      graceDaysRemaining: null,
      reason: "No license activated",
      payload: null,
      stored: null,
    };
  }

  if (stored.token.startsWith("trial:")) {
    const activated = new Date(stored.activatedAt).getTime();
    const trialMs = PLAN_LIMITS.trial.trialDays * 86400000;
    const remaining = Math.ceil((activated + trialMs - Date.now()) / 86400000);
    if (remaining <= 0) {
      const graceMs = PLAN_LIMITS.trial.graceDays * 86400000;
      const graceLeft = Math.ceil((activated + trialMs + graceMs - Date.now()) / 86400000);
      if (graceLeft > 0) {
        return {
          status: "grace",
          plan: "trial",
          edition: stored.edition,
          features: PLAN_FEATURES.trial,
          daysRemaining: 0,
          graceDaysRemaining: graceLeft,
          reason: "Trial expired — grace period active",
          payload: null,
          stored,
        };
      }
      return {
        status: "expired",
        plan: "trial",
        edition: stored.edition,
        features: null,
        daysRemaining: 0,
        graceDaysRemaining: 0,
        reason: "Trial and grace period ended",
        payload: null,
        stored,
      };
    }
    return {
      status: "trial",
      plan: "trial",
      edition: stored.edition,
      features: PLAN_FEATURES.trial,
      daysRemaining: remaining,
      graceDaysRemaining: null,
      payload: null,
      stored,
    };
  }

  const result = await validateLicenseLocally(
    stored.token,
    publicKeyHex,
    fingerprintHash ?? stored.fingerprintHash ?? undefined,
    {
      graceDays: PLAN_LIMITS[stored.plan]?.graceDays ?? 7,
      lastOnlineValidation: stored.lastOnlineValidation ?? undefined,
    }
  );
  return evaluateState(result, publicKeyHex, fingerprintHash);
}

async function evaluateState(
  result: ValidationResult,
  _publicKeyHex: string,
  _fingerprintHash?: string
): Promise<LicenseState> {
  if (result.valid && result.payload) {
    return {
      status: result.payload.plan === "trial" ? "trial" : "active",
      plan: result.payload.plan,
      edition: result.payload.edition,
      features: result.features,
      daysRemaining: result.daysRemaining ?? null,
      graceDaysRemaining: null,
      payload: result.payload,
      stored,
    };
  }
  if (result.reason?.includes("grace")) {
    return {
      status: "grace",
      plan: result.payload?.plan ?? stored?.plan ?? null,
      edition: result.payload?.edition ?? stored?.edition ?? null,
      features: result.payload?.features ?? null,
      daysRemaining: 0,
      graceDaysRemaining: null,
      reason: result.reason,
      payload: result.payload,
      stored,
    };
  }
  if (result.reason?.includes("expired")) {
    return {
      status: "expired",
      plan: result.payload?.plan ?? stored?.plan ?? null,
      edition: result.payload?.edition ?? stored?.edition ?? null,
      features: null,
      daysRemaining: 0,
      graceDaysRemaining: 0,
      reason: result.reason,
      payload: result.payload,
      stored,
    };
  }
  return {
    status: "invalid",
    plan: null,
    edition: null,
    features: null,
    daysRemaining: null,
    graceDaysRemaining: null,
    reason: result.reason,
    payload: result.payload,
    stored,
  };
}

/** Demo helper — activate a plan without cryptography (development only) */
export function activateDemoPlan(plan: LicensePlan, edition: Edition = "hybrid"): LicenseState {
  stored = {
    token: `demo:${plan}:${generateId()}`,
    activatedAt: nowISO(),
    lastOnlineValidation: nowISO(),
    fingerprintHash: null,
    plan,
    edition,
  };
  return {
    status: plan === "trial" ? "trial" : "active",
    plan,
    edition,
    features: PLAN_FEATURES[plan],
    daysRemaining: plan === "trial" ? PLAN_LIMITS.trial.trialDays : 365,
    graceDaysRemaining: null,
    payload: {
      licenseId: generateId() as UUID,
      customerId: generateId() as UUID,
      product: "minarvabiz",
      edition,
      plan,
      features: PLAN_FEATURES[plan],
      issuedAt: nowISO(),
      expiresAt: null,
      activationLimit: PLAN_LIMITS[plan].maxDevices,
      deviceBindings: [],
    },
    stored,
  };
}
