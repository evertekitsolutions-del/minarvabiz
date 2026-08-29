import type { LicensePlan } from "@minarvabiz/types";

export interface PlanLimits {
  maxUsers: number;
  maxDevices: number;
  maxBranches: number;
  maxProducts: number;
  maxCustomers: number;
  maxOrdersPerMonth: number;
  trialDays: number;
  graceDays: number;
  cloudSync: boolean;
  multiBranch: boolean;
}

/** Commercial plan ceilings — -1 means unlimited */
export const PLAN_LIMITS: Record<LicensePlan, PlanLimits> = {
  trial: {
    maxUsers: 1,
    maxDevices: 1,
    maxBranches: 1,
    maxProducts: 100,
    maxCustomers: 100,
    maxOrdersPerMonth: 200,
    trialDays: 14,
    graceDays: 3,
    cloudSync: false,
    multiBranch: false,
  },
  basic: {
    maxUsers: 1,
    maxDevices: 1,
    maxBranches: 1,
    maxProducts: 500,
    maxCustomers: 500,
    maxOrdersPerMonth: 1000,
    trialDays: 0,
    graceDays: 7,
    cloudSync: false,
    multiBranch: false,
  },
  professional: {
    maxUsers: 3,
    maxDevices: 2,
    maxBranches: 1,
    maxProducts: 2000,
    maxCustomers: 2000,
    maxOrdersPerMonth: 5000,
    trialDays: 0,
    graceDays: 7,
    cloudSync: false,
    multiBranch: false,
  },
  business: {
    maxUsers: 10,
    maxDevices: 5,
    maxBranches: 1,
    maxProducts: -1,
    maxCustomers: -1,
    maxOrdersPerMonth: -1,
    trialDays: 0,
    graceDays: 14,
    cloudSync: true,
    multiBranch: false,
  },
  enterprise: {
    maxUsers: -1,
    maxDevices: -1,
    maxBranches: -1,
    maxProducts: -1,
    maxCustomers: -1,
    maxOrdersPerMonth: -1,
    trialDays: 0,
    graceDays: 30,
    cloudSync: true,
    multiBranch: true,
  },
};

export type LimitKey = keyof Omit<PlanLimits, "trialDays" | "graceDays" | "cloudSync" | "multiBranch">;

export function checkLimit(
  plan: LicensePlan,
  key: LimitKey,
  currentCount: number
): { allowed: boolean; limit: number; remaining: number | null } {
  const limit = PLAN_LIMITS[plan][key];
  if (limit < 0) return { allowed: true, limit: -1, remaining: null };
  return {
    allowed: currentCount < limit,
    limit,
    remaining: Math.max(0, limit - currentCount),
  };
}

export function formatLimit(n: number): string {
  return n < 0 ? "Unlimited" : String(n);
}
