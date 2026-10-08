import type { Edition, LicenseFeatures, LicensePlan } from "@minarvabiz/types";

export type EntitlementLifecycle = "trial" | "active" | "grace" | "past_due" | "suspended" | "expired";

export interface CommercialEntitlements {
  schemaVersion: 1;
  organizationId: string;
  plan: LicensePlan;
  edition: Edition;
  lifecycle: EntitlementLifecycle;
  countryPack: string;
  industryPacks: string[];
  modules: Partial<LicenseFeatures>;
  limits: {
    users: number | null;
    branches: number | null;
    devices: number | null;
    storageBytes: number | null;
    aiCredits: number | null;
  };
  capabilities: {
    offline: boolean;
    sync: boolean;
    api: boolean;
  };
  supportTier: "standard" | "priority" | "enterprise";
  effectiveAt: string;
  expiresAt: string | null;
  graceUntil: string | null;
  source: {
    provider: string;
    externalSubscriptionId: string | null;
    revision: string;
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE = /^[a-z][a-z0-9_-]{1,63}$/;

function finiteLimit(value: number | null) {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}

export function validateCommercialEntitlements(value: CommercialEntitlements): string[] {
  const errors: string[] = [];
  if (value.schemaVersion !== 1) errors.push("unsupported schema version");
  if (!UUID.test(value.organizationId)) errors.push("invalid organization id");
  if (!CODE.test(value.countryPack)) errors.push("invalid country pack");
  if (!Array.isArray(value.industryPacks) || value.industryPacks.some((pack) => !CODE.test(pack))) errors.push("invalid industry packs");
  if (new Set(value.industryPacks).size !== value.industryPacks.length) errors.push("duplicate industry packs");
  for (const [name, limit] of Object.entries(value.limits)) if (!finiteLimit(limit)) errors.push(`invalid ${name} limit`);
  if (!/^https?:/.test(value.source.provider) && !CODE.test(value.source.provider)) errors.push("invalid provider");
  if (!value.source.revision || value.source.revision.length > 128) errors.push("invalid revision");
  const effective = Date.parse(value.effectiveAt);
  if (!Number.isFinite(effective)) errors.push("invalid effective date");
  if (value.expiresAt && !Number.isFinite(Date.parse(value.expiresAt))) errors.push("invalid expiry date");
  if (value.graceUntil && !Number.isFinite(Date.parse(value.graceUntil))) errors.push("invalid grace date");
  return errors;
}

export function entitlementAllowsUse(value: CommercialEntitlements, at = new Date()): boolean {
  if (validateCommercialEntitlements(value).length) return false;
  const now = at.getTime();
  if (value.lifecycle === "suspended" || value.lifecycle === "expired") return false;
  if (value.expiresAt && now > Date.parse(value.expiresAt)) {
    return Boolean(value.graceUntil && now <= Date.parse(value.graceUntil) && value.lifecycle === "grace");
  }
  return ["trial", "active", "grace", "past_due"].includes(value.lifecycle);
}

export function entitlementAllowsModule(value: CommercialEntitlements, module: keyof LicenseFeatures, at = new Date()) {
  return entitlementAllowsUse(value, at) && value.modules[module] === true;
}
