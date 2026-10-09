import type { NavItemId, TrialState } from "@minarvabiz/ui";
import type { LicenseFeatures, LicensePlan, Edition } from "@minarvabiz/types";

export type CommercialLicenseState = {
status: "unlicensed" | "active" | "grace" | "expired" | "invalid";
plan: LicensePlan | null;
edition: Edition | null;
features: LicenseFeatures | null;
daysRemaining: number | null;
graceDaysRemaining: number | null;
reason?: string;
licenseId?: string;
activationId?: string;
};
const FULL_TRIAL_FEATURES: LicenseFeatures = {
sales: true, customers: true, inventory: true, tailoring: true, orders: true, laundry: true,
reports: true, staff: true, advancedReports: true, cloudSync: true, multiUser: true,
multiBranch: true, apiAccess: true,
};
export const NAV_FEATURE: Partial<Record<NavItemId, keyof LicenseFeatures>> = {
sales: "sales",
products: "inventory",
warehouse: "inventory",
services: "orders",
laundry: "laundry",
expenses: "inventory",
purchases: "inventory",
customers: "customers",
"customer-crm": "customers",
staff: "staff",
attendance: "staff",
roster: "staff",
"staff-detail": "staff",
suppliers: "inventory",
payments: "sales",
accounting: "advancedReports",
returns: "sales",
reports: "reports",
"day-end": "reports",
  audit: "advancedReports",
};
export function featuresForLicense(state: CommercialLicenseState | null, trial: TrialState | null): LicenseFeatures | null {
  if (state && (state.status === "active" || state.status === "grace") && state.features) {
    const features = { ...state.features };
    if (state.status === "grace") {
      features.advancedReports = false;
      features.cloudSync = false;
      features.multiUser = false;
      features.multiBranch = false;
      features.apiAccess = false;
    }
    return features;
  }
  if (trial?.status === "active") return FULL_TRIAL_FEATURES;
  return null;
}
