/**
 * Runtime feature gates — UI and domain check license + env flags.
 */

import * as phase9Store from "./phase9-store";
import type { LicenseFeatures } from "@minarvabiz/types";

export type GatedFeature = keyof LicenseFeatures;

export function requireFeature(feature: GatedFeature): {
  allowed: boolean;
  reason?: string;
} {
  const state = phase9Store.getLicenseState();
  if (state.status === "expired" || state.status === "invalid" || state.status === "unlicensed") {
    return { allowed: false, reason: `License ${state.status}` };
  }
  if (state.status === "grace") {
    const advanced: GatedFeature[] = [
      "advancedReports",
      "cloudSync",
      "multiBranch",
      "apiAccess",
      "multiUser",
    ];
    if (advanced.includes(feature)) {
      return { allowed: false, reason: "Feature blocked during grace period — renew license" };
    }
  }
  const ok = phase9Store.canUseFeature(feature);
  return ok
    ? { allowed: true }
    : { allowed: false, reason: `Plan does not include: ${feature}` };
}

export function assertLimit(
  resource: "customers" | "products" | "branches" | "users" | "devices"
): { allowed: boolean; reason?: string } {
  const snap = phase9Store.usageSnapshot();
  const check = snap.checks[resource];
  if (!check) return { allowed: true };
  if (!check.allowed) {
    return {
      allowed: false,
      reason: `${resource} limit reached (${check.limit}). Upgrade plan.`,
    };
  }
  return { allowed: true };
}
