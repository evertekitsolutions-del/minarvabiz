/**
 * Phase 9: Branches + license runtime bridge.
 */

import type { Branch, LicensePlan, Edition, UUID } from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import {
  startTrial,
  activateDemoPlan,
  activateWithToken,
  evaluateStoredLicense,
  clearLicense,
  getStoredLicense,
  DEMO_PUBLIC_KEY_HEX,
  type LicenseState,
  PLAN_LIMITS,
  checkLimit,
  formatLimit,
  PLAN_FEATURES,
} from "@minarvabiz/licensing";
import * as mainStore from "./store";

const branches: Branch[] = [
  {
    id: "branch-hq",
    name: "Main Branch",
    code: "HQ",
    isHeadquarters: true,
    isActive: true,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
];

let activeBranchId: UUID = branches[0].id;
let licenseState: LicenseState = startTrial("hybrid");

export function listBranches(): Branch[] {
  return branches.filter((b) => !b.deletedAt && b.isActive);
}

export function getActiveBranch(): Branch | undefined {
  return branches.find((b) => b.id === activeBranchId);
}

export function setActiveBranch(id: UUID): boolean {
  const plan = licenseState.plan ?? "trial";
  const limits = PLAN_LIMITS[plan];
  if (!limits.multiBranch && id !== branches.find((b) => b.isHeadquarters)?.id) {
    // Non-enterprise cannot switch away from HQ in multi-branch sense —
    // still allow if only one branch exists
    if (listBranches().length > 1 && !limits.multiBranch) {
      return false;
    }
  }
  if (!branches.find((b) => b.id === id && b.isActive)) return false;
  activeBranchId = id;
  return true;
}

export function createBranch(input: {
  name: string;
  code?: string | null;
  address?: string | null;
  phone?: string | null;
}): { branch: Branch | null; error?: string } {
  const plan = licenseState.plan ?? "trial";
  const check = checkLimit(plan, "maxBranches", listBranches().length);
  if (!check.allowed) {
    return {
      branch: null,
      error: `Branch limit reached (${formatLimit(check.limit)}). Upgrade to Enterprise for multi-branch.`,
    };
  }
  if (!PLAN_LIMITS[plan].multiBranch && listBranches().length >= 1) {
    return {
      branch: null,
      error: "Multi-branch requires Enterprise plan",
    };
  }
  const b: Branch = {
    id: generateId(),
    name: input.name,
    code: input.code ?? null,
    address: input.address ?? null,
    phone: input.phone ?? null,
    isHeadquarters: false,
    isActive: true,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  branches.push(b);
  return { branch: b };
}

export function getLicenseState(): LicenseState {
  return licenseState;
}

export async function refreshLicense(): Promise<LicenseState> {
  licenseState = await evaluateStoredLicense(DEMO_PUBLIC_KEY_HEX);
  return licenseState;
}

export function applyTrial(): LicenseState {
  licenseState = startTrial("hybrid");
  return licenseState;
}

export function applyDemoPlan(plan: LicensePlan, edition: Edition = "hybrid"): LicenseState {
  licenseState = activateDemoPlan(plan, edition);
  return licenseState;
}

export async function applyLicenseToken(
  token: string,
  fingerprintHash?: string
): Promise<LicenseState> {
  licenseState = await activateWithToken(token, DEMO_PUBLIC_KEY_HEX, fingerprintHash);
  return licenseState;
}

export function deactivateLicense(): LicenseState {
  clearLicense();
  licenseState = {
    status: "unlicensed",
    plan: null,
    edition: null,
    features: null,
    daysRemaining: null,
    graceDaysRemaining: null,
    reason: "License cleared",
    payload: null,
    stored: getStoredLicense(),
  };
  return licenseState;
}

export function usageSnapshot() {
  const plan = licenseState.plan ?? "trial";
  const customers = mainStore.listCustomers().length;
  const products = mainStore.listProducts().length;
  return {
    plan,
    limits: PLAN_LIMITS[plan],
    features: licenseState.features ?? PLAN_FEATURES.trial,
    usage: {
      customers,
      products,
      branches: listBranches().length,
      users: 1,
      devices: 1,
    },
    checks: {
      customers: checkLimit(plan, "maxCustomers", customers),
      products: checkLimit(plan, "maxProducts", products),
      branches: checkLimit(plan, "maxBranches", listBranches().length),
      users: checkLimit(plan, "maxUsers", 1),
      devices: checkLimit(plan, "maxDevices", 1),
    },
  };
}

export function canUseFeature(feature: keyof typeof PLAN_FEATURES.trial): boolean {
  const features = licenseState.features ?? PLAN_FEATURES.trial;
  return Boolean(features[feature]);
}


export function hydratePhase9(data: {
  branches?: Branch[];
  activeBranchId?: string;
}) {
  if (data.branches) {
    branches.length = 0;
    branches.push(...data.branches);
    if (data.activeBranchId && branches.some((b) => b.id === data.activeBranchId)) {
      activeBranchId = data.activeBranchId as typeof activeBranchId;
    } else if (branches[0]) {
      activeBranchId = branches[0].id;
    }
  }
}

