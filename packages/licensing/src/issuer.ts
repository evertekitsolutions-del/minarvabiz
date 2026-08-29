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

export async function issueLicense(input: IssueLicenseInput): Promise<IssuedLicense> {
  if (!input.privateKeyHex || input.privateKeyHex.replace(/0/g, "").length === 0) {
    throw new Error("Private key required to issue licenses");
  }
  const features: LicenseFeatures = { ...PLAN_FEATURES[input.plan] };
  const payload: LicensePayload = {
    licenseId: generateId() as UUID,
    customerId: (input.customerId || generateId()) as UUID,
    product: "minarvabiz",
    edition: input.edition,
    plan: input.plan,
    features,
    issuedAt: nowISO(),
    expiresAt: input.expiresAt ?? null,
    activationLimit: input.activationLimit ?? PLAN_LIMITS[input.plan].maxDevices,
    deviceBindings: input.deviceBindings ?? [],
  };
  const token = await signLicense(payload, input.privateKeyHex);
  const record: IssuedLicense = {
    token,
    payload,
    customerName: input.customerName,
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
