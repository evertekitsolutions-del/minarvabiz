import * as React from "react";
import { LicensePanel, type TrialState } from "@minarvabiz/ui";
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

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function DesktopLicenseView({
  state,
  trialState,
  deviceFingerprint,
  customerCount,
  productCount,
  onStateChange,
  onTrialStateChange,
}: {
  state: DesktopCommercialLicenseState;
  trialState: TrialState;
  deviceFingerprint: string;
  customerCount: number;
  productCount: number;
  onStateChange: (state: DesktopCommercialLicenseState) => void;
  onTrialStateChange: (state: TrialState) => void;
}) {
  const commercialActive = state.status === "active" || state.status === "grace";
  const trialInUse = !commercialActive && trialState.status === "active";
  const displayState = trialInUse
    ? {
        status: "trial",
        plan: "trial" as LicensePlan,
        edition: "offline" as Edition,
        daysRemaining: trialState.daysRemaining,
        graceDaysRemaining: null,
        reason: null,
      }
    : {
        status: state.status,
        plan: state.plan,
        edition: state.edition,
        daysRemaining: state.daysRemaining,
        graceDaysRemaining: state.graceDaysRemaining,
        reason: state.reason,
      };

  const plan = displayState.plan ?? "trial";
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
    const [license, trial] = await Promise.all([
      window.minarvaDesktop?.getLicenseState(),
      window.minarvaDesktop?.getTrialState(),
    ]);
    if (license) onStateChange(license as DesktopCommercialLicenseState);
    if (trial) onTrialStateChange(trial);
  }

  return (
    <div className="space-y-4">
      {trialInUse && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">30-day free trial active</div>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">
                {trialState.daysRemaining} day{trialState.daysRemaining === 1 ? "" : "s"} remaining
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                The trial unlocks all Minarva Biz features on this Windows device. When it expires, business data is preserved but the application is locked until a valid commercial license is activated.
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-700">
              {trialState.synced ? "Trial verified" : "Offline trial"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><div className="text-xs text-slate-500">Started</div><div className="font-semibold text-slate-800">{formatDate(trialState.trialStartedAt)}</div></div>
            <div><div className="text-xs text-slate-500">Expires</div><div className="font-semibold text-slate-800">{formatDate(trialState.trialExpiresAt)}</div></div>
            <div><div className="text-xs text-slate-500">Business</div><div className="font-semibold text-slate-800">{trialState.registration?.organizationName || "—"}</div></div>
            <div><div className="text-xs text-slate-500">Edition</div><div className="font-semibold text-slate-800">Offline trial</div></div>
          </div>
        </div>
      )}

      <LicensePanel
        state={displayState}
        usage={usage}
        licenseId={trialInUse ? "30-day trial" : state.licenseId}
        activationId={trialInUse ? "Trial activation" : state.activationId}
        deviceFingerprint={deviceFingerprint}
        onRefresh={() => void refresh()}
        onActivateToken={(token) => {
          void window.minarvaDesktop?.activateLicenseToken(token).then(async (value) => {
            onStateChange(value as DesktopCommercialLicenseState);
            const trial = await window.minarvaDesktop?.getTrialState();
            if (trial) onTrialStateChange(trial);
          });
        }}
        onDeactivate={commercialActive ? () => {
          if (!window.confirm("Deactivate this license on this computer? Business data will be kept, but licensed features will be unavailable until reactivated.")) return;
          void window.minarvaDesktop?.deactivateLicense().then(() => refresh());
        } : undefined}
      />
    </div>
  );
}
