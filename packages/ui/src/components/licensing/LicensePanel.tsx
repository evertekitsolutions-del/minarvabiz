"use client";

import * as React from "react";
import type { LicensePlan, Edition } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { FormField, inputClass, selectClass } from "../forms/FormField";

export interface LicenseViewState {
  status: string;
  plan: LicensePlan | null;
  edition: Edition | null;
  daysRemaining: number | null;
  graceDaysRemaining: number | null;
  reason?: string | null;
}

export interface UsageView {
  plan: LicensePlan;
  limits: {
    maxUsers: number;
    maxDevices: number;
    maxBranches: number;
    maxProducts: number;
    maxCustomers: number;
    maxOrdersPerMonth: number;
    graceDays: number;
    cloudSync: boolean;
    multiBranch: boolean;
  };
  usage: {
    customers: number;
    products: number;
    branches: number;
    users: number;
    devices: number;
  };
  checks: Record<string, { allowed: boolean; limit: number; remaining: number | null }>;
}

const PLAN_OPTIONS: LicensePlan[] = ["trial", "basic", "professional", "business", "enterprise"];

function fmt(n: number) {
  return n < 0 ? "∞" : String(n);
}

export function LicensePanel({
  state,
  usage,
  onActivateToken,
  onStartTrial,
  onDemoPlan,
  onDeactivate,
  onRefresh,
}: {
  state: LicenseViewState;
  usage: UsageView;
  onActivateToken: (token: string) => void;
  onStartTrial: () => void;
  onDemoPlan: (plan: LicensePlan) => void;
  onDeactivate: () => void;
  onRefresh?: () => void;
}) {
  const [token, setToken] = React.useState("");
  const [demoPlan, setDemoPlan] = React.useState<LicensePlan>("professional");

  const statusColor =
    state.status === "active" || state.status === "trial"
      ? "text-emerald-600"
      : state.status === "grace"
        ? "text-amber-600"
        : state.status === "expired" || state.status === "invalid"
          ? "text-rose-600"
          : "text-slate-600";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">License & Plans</h2>
          <p className="text-sm text-slate-500">Activation, limits, and grace period</p>
        </div>
        {onRefresh && (
          <Button variant="outline" onClick={onRefresh}>Refresh</Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Status</div>
            <div className={`text-lg font-bold capitalize ${statusColor}`}>{state.status}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Plan</div>
            <div className="text-lg font-bold capitalize">{state.plan ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Edition</div>
            <div className="text-lg font-bold capitalize">{state.edition ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Days left</div>
            <div className="text-lg font-bold">
              {state.daysRemaining != null ? state.daysRemaining : "—"}
              {state.graceDaysRemaining != null && state.graceDaysRemaining > 0 && (
                <span className="ml-1 text-sm font-medium text-amber-600">
                  (+{state.graceDaysRemaining} grace)
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {state.reason && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{state.reason}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Plan limits & usage</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-slate-400">
                <th className="pb-2">Resource</th>
                <th className="pb-2">Used</th>
                <th className="pb-2">Limit</th>
                <th className="pb-2">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Customers", usage.usage.customers, usage.checks.customers],
                  ["Products", usage.usage.products, usage.checks.products],
                  ["Branches", usage.usage.branches, usage.checks.branches],
                  ["Users", usage.usage.users, usage.checks.users],
                  ["Devices", usage.usage.devices, usage.checks.devices],
                ] as const
              ).map(([label, used, check]) => (
                <tr key={label} className="border-b border-slate-50">
                  <td className="py-2 font-medium">{label}</td>
                  <td className="py-2">{used}</td>
                  <td className="py-2">{fmt(check.limit)}</td>
                  <td className={`py-2 ${!check.allowed ? "font-semibold text-rose-600" : ""}`}>
                    {check.remaining == null ? "∞" : check.remaining}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
            <span>Cloud sync: {usage.limits.cloudSync ? "Yes" : "No"}</span>
            <span>Multi-branch: {usage.limits.multiBranch ? "Yes" : "No"}</span>
            <span>Grace days: {usage.limits.graceDays}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Activate license</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FormField label="License token (Ed25519 signed)">
            <textarea
              className={inputClass + " h-24 py-2 font-mono text-xs"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste signed license token…"
            />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onActivateToken(token.trim())} disabled={!token.trim()}>
              Activate token
            </Button>
            <Button variant="outline" onClick={onStartTrial}>Start trial</Button>
            <Button variant="outline" onClick={onDeactivate}>Deactivate</Button>
          </div>
          <div className="border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs text-slate-500">
              Development only — switch demo plan (no cryptographic token):
            </p>
            <div className="flex flex-wrap gap-2">
              <select
                className={selectClass + " w-auto"}
                value={demoPlan}
                onChange={(e) => setDemoPlan(e.target.value as LicensePlan)}
              >
                {PLAN_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <Button variant="outline" onClick={() => onDemoPlan(demoPlan)}>
                Apply demo plan
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
