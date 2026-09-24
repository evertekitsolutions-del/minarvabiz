import type { LicensePlan } from "@minarvabiz/licensing";
import type { Edition, LicenseFeatures } from "@minarvabiz/types";
import type { AdminRole, LicenseRegistryRow } from "./types";

export const PLANS: LicensePlan[] = ["trial", "basic", "professional", "business", "enterprise"];
export const EDITIONS: Edition[] = ["online", "offline", "hybrid"];

export const FEATURE_LABELS: Record<keyof LicenseFeatures, string> = {
  sales: "Billing / Sales",
  customers: "Customers",
  inventory: "Inventory",
  tailoring: "Tailoring",
  orders: "Orders",
  laundry: "Laundry",
  reports: "Reports",
  staff: "Staff",
  advancedReports: "Advanced reports",
  cloudSync: "Cloud sync",
  multiUser: "Multi-user",
  multiBranch: "Multi-branch",
  apiAccess: "API access",
};

export function defaultFeatures(plan: LicensePlan): LicenseFeatures {
  const full: LicenseFeatures = {
    sales: true,
    customers: true,
    inventory: true,
    tailoring: true,
    orders: true,
    laundry: true,
    reports: true,
    staff: true,
    advancedReports: true,
    cloudSync: true,
    multiUser: true,
    multiBranch: true,
    apiAccess: true,
  };
  const planFeatures: Record<LicensePlan, Partial<LicenseFeatures>> = {
    trial: full,
    basic: { sales: true, customers: true, inventory: true },
    professional: {
      sales: true,
      customers: true,
      inventory: true,
      tailoring: true,
      orders: true,
      laundry: true,
      reports: true,
    },
    business: { ...full, multiBranch: false, apiAccess: false },
    enterprise: full,
  };
  return Object.fromEntries(
    (Object.keys(full) as (keyof LicenseFeatures)[]).map((key) => [
      key,
      Boolean(planFeatures[plan][key]),
    ]),
  ) as LicenseFeatures;
}

export function canIssueLicense(role: AdminRole): boolean {
  return role === "operator" || role === "admin";
}

export function canManageLicenseStatus(role: AdminRole): boolean {
  return role === "admin";
}

export function activeActivationCount(license: LicenseRegistryRow): number {
  return (license.activations || []).filter((activation) => activation.status === "active").length;
}

export function enabledFeatureLabels(license: LicenseRegistryRow): string[] {
  return (Object.keys(license.features || {}) as (keyof LicenseFeatures)[])
    .filter((key) => Boolean(license.features?.[key]))
    .map((key) => FEATURE_LABELS[key]);
}

export function customerNameForLicense(license: LicenseRegistryRow): string {
  return license.metadata?.customerName?.trim() || "Unnamed customer";
}
