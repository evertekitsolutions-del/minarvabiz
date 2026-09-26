import * as React from "react";
import { LicensePanel } from "@minarvabiz/ui";
import { PLAN_LIMITS, checkLimit } from "@minarvabiz/licensing";
import type { Edition, LicenseFeatures, LicensePlan } from "@minarvabiz/types";

export type DesktopCommercialLicenseState = {
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

export function DesktopLicenseView({
  state,
  deviceFingerprint,
  customerCount,
  productCount,
  onStateChange,
}: {
  state: DesktopCommercialLicenseState;
  deviceFingerprint: string;
  customerCount: number;
  productCount: number;
  onStateChange: (state: DesktopCommercialLicenseState) => void;
}) {
  const plan = state.plan ?? "trial";
  const limits = PLAN_LIMITS[plan];
  const usage = {
    plan,
    limits: {
      maxUsers: limits.maxUsers,
      maxDevices: limits.maxDevices,
      maxBranches: limits.maxBranches,
      maxProducts: limits.maxProducts,
      maxCustomers: limits.maxCustomers,
      maxOrdersPerMonth: limits.maxOrdersPerMonth,
      graceDays: limits.graceDays,
      cloudSync: limits.cloudSync,
      multiBranch: limits.multiBranch,
    },
    usage: { customers: customerCount, products: productCount, branches: 1, users: 1, devices: 1 },
    checks: {
      customers: checkLimit(plan, "maxCustomers", customerCount),
      products: checkLimit(plan, "maxProducts", productCount),
      branches: checkLimit(plan, "maxBranches", 1),
      users: checkLimit(plan, "maxUsers", 1),
      devices: checkLimit(plan, "maxDevices", 1),
    },
  };

  async function refresh() {
    const value = await window.minarvaDesktop?.getLicenseState();
    if (value) onStateChange(value as DesktopCommercialLicenseState);
  }

  return (
    <LicensePanel
      state={{
        status: state.status,
        plan: state.plan,
        edition: state.edition,
        daysRemaining: state.daysRemaining,
        graceDaysRemaining: state.graceDaysRemaining,
        reason: state.reason,
      }}
      usage={usage}
      licenseId={state.licenseId}
      activationId={state.activationId}
      deviceFingerprint={deviceFingerprint}
      onRefresh={() => void refresh()}
      onActivateToken={(token) => {
        void window.minarvaDesktop?.activateLicenseToken(token).then((value) => onStateChange(value as DesktopCommercialLicenseState));
      }}
      onDeactivate={() => {
        if (!window.confirm("Deactivate this license on this computer? Business data will be kept, but licensed features will be unavailable until reactivated.")) return;
        void window.minarvaDesktop?.deactivateLicense().then(() => refresh());
      }}
    />
  );
}
