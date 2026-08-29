import type { LicensePayload, LicenseFeatures } from "@minarvabiz/types";
import { isExpired, daysUntil } from "@minarvabiz/utils";
import { verifyLicenseToken } from "./token";
import { hasFeature } from "./features";

export interface ValidationResult {
  valid: boolean; payload: LicensePayload | null; reason?: string;
  daysRemaining?: number | null; features: LicenseFeatures | null;
}

export async function validateLicenseLocally(
  token: string, publicKeyHex: string, currentFingerprintHash?: string,
  options?: { graceDays?: number; lastOnlineValidation?: string }
): Promise<ValidationResult> {
  const payload = await verifyLicenseToken(token, publicKeyHex);
  if (!payload) return { valid: false, payload: null, reason: "Invalid signature or malformed token", features: null };
  if (payload.product !== "minarvabiz") return { valid: false, payload, reason: "Wrong product", features: null };
  if (payload.expiresAt && isExpired(payload.expiresAt)) {
    const graceDays = options?.graceDays ?? 0;
    if (graceDays > 0 && options?.lastOnlineValidation) {
      const last = new Date(options.lastOnlineValidation).getTime();
      if (Date.now() - last > graceDays * 86400000) {
        return { valid: false, payload, reason: "License expired and grace period ended", daysRemaining: 0, features: null };
      }
    } else {
      return { valid: false, payload, reason: "License expired", daysRemaining: 0, features: null };
    }
  }
  if (currentFingerprintHash && payload.deviceBindings.length > 0 && !payload.deviceBindings.includes(currentFingerprintHash)) {
    return { valid: false, payload, reason: "Device not activated for this license", features: null };
  }
  return { valid: true, payload, daysRemaining: payload.expiresAt ? daysUntil(payload.expiresAt) : null, features: payload.features };
}

export function checkFeature(features: LicenseFeatures | null | undefined, feature: keyof LicenseFeatures): boolean {
  return features ? hasFeature(features, feature) : false;
}
