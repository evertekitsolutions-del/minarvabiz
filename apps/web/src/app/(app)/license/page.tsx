"use client";

import * as React from "react";
import { LicensePanel, BranchPanel } from "@minarvabiz/ui";
import { phase9Store } from "@minarvabiz/business-logic";
import type { Branch, LicensePlan } from "@minarvabiz/types";

export default function LicensePage() {
  const [state, setState] = React.useState(() => phase9Store.getLicenseState());
  const [usage, setUsage] = React.useState(() => phase9Store.usageSnapshot());
  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [branchMsg, setBranchMsg] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    setState(phase9Store.getLicenseState());
    setUsage(phase9Store.usageSnapshot());
    setBranches(phase9Store.listBranches());
    setActiveId(phase9Store.getActiveBranch()?.id ?? null);
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  const canAdd =
    usage.limits.multiBranch && usage.checks.branches.allowed;

  return (
    <div className="space-y-8">
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
        onActivateToken={async (token) => {
          await phase9Store.applyLicenseToken(token);
          refresh();
        }}
        onStartTrial={() => {
          phase9Store.applyTrial();
          refresh();
        }}
        onDemoPlan={(plan: LicensePlan) => {
          phase9Store.applyDemoPlan(plan);
          refresh();
        }}
        onDeactivate={() => {
          phase9Store.deactivateLicense();
          refresh();
        }}
        onRefresh={refresh}
      />

      <BranchPanel
        branches={branches}
        activeBranchId={activeId}
        canAdd={canAdd}
        limitMessage={
          !usage.limits.multiBranch
            ? "Upgrade to Enterprise to enable multi-branch"
            : branchMsg
        }
        onSelect={(id) => {
          const ok = phase9Store.setActiveBranch(id);
          if (!ok) setBranchMsg("Cannot switch branch on current plan");
          else setBranchMsg(null);
          refresh();
        }}
        onAdd={(data) => {
          const r = phase9Store.createBranch(data);
          if (!r.branch) return { ok: false, error: r.error };
          refresh();
          return { ok: true };
        }}
      />
    </div>
  );
}
