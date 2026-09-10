/**
 * License issuance — server-side only (license-admin).
 * Never import this into web/desktop client bundles with a real private key.
 */

import type {
  LicensePayload, LicensePlan, Edition, LicenseFeatures, UUID,
} from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { signLicense } from "./token";
import { PLAN_FEATURES } from "./features";
import { PLAN_LIMITS } from "./limits";

export interface IssueLicenseInput {
  customerId?: UUID;
  customerName: string;
  plan: LicensePlan;
  edition: Edition;
  expiresAt?: string | null;
  activationLimit?: number;
  deviceBindings?: string[];
  privateKeyHex: string;
}

export interface IssuedLicense {
  token: string;
  payload: LicensePayload;
  customerName: string;
  issuedAt: string;
}

const issuedLog: IssuedLicense[] = [];

const PLANS = new Set<LicensePlan>(["trial", "basic", "professional", "business", "enterprise"]);
const EDITIONS = new Set<Edition>(["online", "offline", "hybrid"]);

function normalizedActivationLimit(plan: LicensePlan, requested?: number): number {
  const maximum = PLAN_LIMITS[plan].maxDevices;
  const value = requested ?? maximum;
  if (value === -1 && maximum === -1) return -1;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Activation limit must be a positive integer or -1 for unlimited plans");
  if (maximum >= 0 && value > maximum) throw new Error(`Activation limit exceeds the ${plan} plan device limit (${maximum})`);
  return value;
}

function validatePrivateKey(privateKeyHex: string): void {
  if (!/^[0-9a-f]{64}$/i.test(privateKeyHex)) throw new Error("A valid 32-byte Ed25519 private key is required");
}

function validateExpiry(expiresAt: string | null | undefined, issuedAt: string): string | null {
  if (expiresAt == null) return null;
  const expiry = new Date(expiresAt);
  const issued = new Date(issuedAt);
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() < issued.getTime()) {
    throw new Error("License expiry must be a valid date on or after issuance");
  }
  return expiry.toISOString();
}

function validateDeviceBindings(bindings: string[] | undefined): string[] {
  const value = bindings ?? [];
  if (!value.every((binding) => typeof binding === "string" && /^[a-f0-9]{64}$/i.test(binding))) {
    throw new Error("Device bindings must contain 64-character hexadecimal device fingerprints");
  }
  return value;
}

export async function issueLicense(input: IssueLicenseInput): Promise<IssuedLicense> {
  validatePrivateKey(input.privateKeyHex);
  if (!input.customerName.trim()) throw new Error("Customer name is required");
  if (!PLANS.has(input.plan)) throw new Error("Invalid license plan");
  if (!EDITIONS.has(input.edition)) throw new Error("Invalid license edition");
  const issuedAt = nowISO();
  const features: LicenseFeatures = { ...PLAN_FEATURES[input.plan] };
  const payload: LicensePayload = {
    licenseId: generateId() as UUID,
    customerId: (input.customerId || generateId()) as UUID,
    product: "minarvabiz",
    edition: input.edition,
    plan: input.plan,
    features,
    issuedAt,
    expiresAt: validateExpiry(input.expiresAt, issuedAt),
    activationLimit: normalizedActivationLimit(input.plan, input.activationLimit),
    deviceBindings: validateDeviceBindings(input.deviceBindings),
  };
  const token = await signLicense(payload, input.privateKeyHex);
  const record: IssuedLicense = {
    token,
    payload,
    customerName: input.customerName.trim(),
    issuedAt: nowISO(),
  };
  issuedLog.unshift(record);
  return record;
}

export function listIssued(): IssuedLicense[] {
  return [...issuedLog];
}

/**
 * Demo issuance without real crypto — for UI development only.
 * Produces a demo:* token that client activateDemoPlan path can mirror.
 */
export function issueDemoLicense(input: {
  customerName: string;
  plan: LicensePlan;
  edition: Edition;
}): IssuedLicense {
  const payload: LicensePayload = {
    licenseId: generateId() as UUID,
    customerId: generateId() as UUID,
    product: "minarvabiz",
    edition: input.edition,
    plan: input.plan,
    features: { ...PLAN_FEATURES[input.plan] },
    issuedAt: nowISO(),
    expiresAt: null,
    activationLimit: PLAN_LIMITS[input.plan].maxDevices,
    deviceBindings: [],
  };
  const record: IssuedLicense = {
    token: `demo:${input.plan}:${payload.licenseId}`,
    payload,
    customerName: input.customerName,
    issuedAt: nowISO(),
  };
  issuedLog.unshift(record);
  return record;
}
