import type { LicenseFeatures, LicensePlan } from "@minarvabiz/types";
export const PLAN_FEATURES: Record<LicensePlan, LicenseFeatures> = {
  trial: { sales:true, customers:true, inventory:true, tailoring:true, orders:true, laundry:true, reports:true, staff:false, advancedReports:false, cloudSync:false, multiUser:false, multiBranch:false, apiAccess:false },
  basic: { sales:true, customers:true, inventory:true, tailoring:false, orders:false, laundry:false, reports:false, staff:false, advancedReports:false, cloudSync:false, multiUser:false, multiBranch:false, apiAccess:false },
  professional: { sales:true, customers:true, inventory:true, tailoring:true, orders:true, laundry:true, reports:true, staff:false, advancedReports:false, cloudSync:false, multiUser:false, multiBranch:false, apiAccess:false },
  business: { sales:true, customers:true, inventory:true, tailoring:true, orders:true, laundry:true, reports:true, staff:true, advancedReports:true, cloudSync:true, multiUser:true, multiBranch:false, apiAccess:false },
  enterprise: { sales:true, customers:true, inventory:true, tailoring:true, orders:true, laundry:true, reports:true, staff:true, advancedReports:true, cloudSync:true, multiUser:true, multiBranch:true, apiAccess:true },
};
export function hasFeature(features: LicenseFeatures, feature: keyof LicenseFeatures): boolean {
  return Boolean(features[feature]);
}
