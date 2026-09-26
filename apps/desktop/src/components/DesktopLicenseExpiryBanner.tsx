import * as React from "react";
import { Button, type TrialState } from "@minarvabiz/ui";
import type { Edition, LicenseFeatures, LicensePlan } from "@minarvabiz/types";

type CommercialState = {
  status: "unlicensed" | "active" | "grace" | "expired" | "invalid";
  plan: LicensePlan | null;
  edition: Edition | null;
  features: LicenseFeatures | null;
  daysRemaining: number | null;
};

export function effectiveLicenseDaysRemaining(state: CommercialState | null, trial: TrialState | null): number | null {
  if (state && (state.status === "active" || state.status === "grace")) return state.daysRemaining;
  if (trial?.status === "active") return trial.daysRemaining;
  return null;
}

export function DesktopLicenseExpiryBanner({
  commercialActive,
  trialState,
  daysRemaining,
  onManage,
}: {
  commercialActive: boolean;
  trialState: TrialState;
  daysRemaining: number | null;
  onManage: () => void;
}) {
  const trialInUse = !commercialActive && trialState.status === "active";
  const visible = trialInUse || (daysRemaining != null && daysRemaining <= 30);
  if (!visible || daysRemaining == null) return null;

  const tone = daysRemaining <= 3
    ? "border-rose-200 bg-rose-50"
    : daysRemaining <= 7
      ? "border-amber-200 bg-amber-50"
      : "border-blue-200 bg-blue-50";
  const labelTone = daysRemaining <= 3
    ? "text-rose-700"
    : daysRemaining <= 7
      ? "text-amber-700"
      : "text-blue-700";

  return (
    <div className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between ${tone}`}>
      <div>
        <div className={`text-xs font-semibold uppercase tracking-wide ${labelTone}`}>
          {trialInUse ? "Free trial" : "License"} · Renewal notice
        </div>
        <div className="mt-1 font-semibold text-slate-900">
          {daysRemaining} day{daysRemaining === 1 ? "" : "s"} remaining
        </div>
        <p className="mt-0.5 text-sm text-slate-600">
          {trialInUse
            ? "Your 30-day Minarva Biz trial is active. Activate a commercial license before the trial expires to continue using the application."
            : "Your Minarva Biz license is approaching expiry. Renew before expiry to avoid service interruption."}{" "}
          Business data is preserved.
        </p>
      </div>
      <Button variant="outline" onClick={onManage}>Manage License</Button>
    </div>
  );
}
