import type { LicensePayload, LicenseFeatures } from "@minarvabiz/types";
import { isExpired, daysUntil } from "@minarvabiz/utils";
import { verifyLicenseToken } from "./token";
import { hasFeature } from "./features";
import { PLAN_LIMITS } from "./limits";

export interface ValidationResult {
  valid: boolean; payload: LicensePayload | null; reason?: string;
  daysRemaining?: number | null; graceDaysRemaining?: number | null;
  inGrace?: boolean; features: LicenseFeatures | null;
}

export async function validateLicenseLocally(
  token: string, publicKeyHex: string, currentFingerprintHash?: string,
  options?: { graceDays?: number; lastOnlineValidation?: string }
): Promise<ValidationResult> {
  const payload = await verifyLicenseToken(token, publicKeyHex);
  if (!payload) return { valid: false, payload: null, reason: "Invalid signature or malformed token", features: null };
  if (payload.product !== "minarvabiz") return { valid: false, payload, reason: "Wrong product", features: null };
  let inGrace = false;
  let graceDaysRemaining: number | null = null;
  if (payload.expiresAt && isExpired(payload.expiresAt)) {
    const graceDays = options?.graceDays ?? PLAN_LIMITS[payload.plan].graceDays;
    const expires = new Date(payload.expiresAt).getTime();
    const lastOnline = options?.lastOnlineValidation ? new Date(options.lastOnlineValidation).getTime() : NaN;
    const graceAnchor = Number.isFinite(lastOnline) ? Math.max(expires, lastOnline) : NaN;
    const graceUntil = Number.isFinite(graceAnchor) ? graceAnchor + graceDays * 86400000 : NaN;
    const now = Date.now();
    if (graceDays > 0 && Number.isFinite(graceUntil) && now <= graceUntil) {
      inGrace = true;
      graceDaysRemaining = Math.max(0, Math.ceil((graceUntil - now) / 86400000));
    } else if (graceDays > 0 && options?.lastOnlineValidation) {
      return { valid: false, payload, reason: "License expired and grace period ended", daysRemaining: 0, graceDaysRemaining: 0, features: null };
    } else {
      return { valid: false, payload, reason: "License expired", daysRemaining: 0, graceDaysRemaining: 0, features: null };
    }
  }
  if (currentFingerprintHash && payload.deviceBindings.length > 0 && !payload.deviceBindings.includes(currentFingerprintHash)) {
    return { valid: false, payload, reason: "Device not activated for this license", features: null };
  }
  return {
    valid: true,
    payload,
    reason: inGrace ? "License expired — grace period active" : undefined,
    daysRemaining: inGrace ? 0 : payload.expiresAt ? daysUntil(payload.expiresAt) : null,
    graceDaysRemaining,
    inGrace,
    features: payload.features,
  };
}

export function checkFeature(features: LicenseFeatures | null | undefined, feature: keyof LicenseFeatures): boolean {
  return features ? hasFeature(features, feature) : false;
}
