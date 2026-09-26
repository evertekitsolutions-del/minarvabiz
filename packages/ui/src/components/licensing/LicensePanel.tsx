"use client";

import * as React from "react";
import type { LicensePlan, Edition } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { FormField, inputClass } from "../forms/FormField";

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

function fmt(n: number) {
  return n < 0 ? "∞" : String(n);
}

function expiryWarning(daysRemaining: number | null, status: string): { stage: number; text: string } | null {
  if (daysRemaining == null || daysRemaining < 0 || daysRemaining > 30) return null;
  if (!["active", "trial", "grace"].includes(status)) return null;
  const stage = daysRemaining <= 1 ? 1 : daysRemaining <= 3 ? 3 : daysRemaining <= 7 ? 7 : daysRemaining <= 15 ? 15 : 30;
  const unit = daysRemaining === 1 ? "day" : "days";
  return {
    stage,
    text: `License expiry warning: ${daysRemaining} ${unit} remaining. Renew before expiry to avoid feature restrictions; your business data will not be deleted.`,
  };
}

export function LicensePanel({
  state,
  usage,
  onActivateToken,
  onStartTrial,
  onDeactivate,
  onRefresh,
  licenseId,
  activationId,
  deviceFingerprint,
}: {
  state: LicenseViewState;
  usage: UsageView;
  onActivateToken: (token: string) => void;
  onStartTrial?: () => void;
  onDeactivate?: () => void;
  onRefresh?: () => void;
  licenseId?: string | null;
  activationId?: string | null;
  deviceFingerprint?: string | null;
}) {
  const [token, setToken] = React.useState("");
  const warning = expiryWarning(state.daysRemaining, state.status);

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
        {onRefresh && <Button variant="outline" onClick={onRefresh}>Refresh</Button>}
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
                <span className="ml-1 text-sm font-medium text-amber-600">(+{state.graceDaysRemaining} grace)</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {state.reason && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{state.reason}</p>}
      {warning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Renewal warning stage: {warning.stage} days</div>
          <p className="mt-1 text-sm text-amber-900">{warning.text}</p>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">License identity & renewal</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <div><div className="text-xs text-slate-500">License ID</div><div className="break-all font-mono text-xs text-slate-800">{licenseId || "Not activated"}</div></div>
            <div><div className="text-xs text-slate-500">Activation ID</div><div className="break-all font-mono text-xs text-slate-800">{activationId || "—"}</div></div>
            <div className="md:col-span-2"><div className="text-xs text-slate-500">Device fingerprint</div><div className="break-all font-mono text-xs text-slate-800">{deviceFingerprint || "Loading…"}</div></div>
          </div>
          <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
            To renew an Offline license, send the License ID and Device Fingerprint to your software provider. Paste the renewed signed token below; your business data is preserved.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Plan limits & usage</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-slate-400">
                <th className="pb-2">Resource</th><th className="pb-2">Used</th><th className="pb-2">Limit</th><th className="pb-2">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Customers", usage.usage.customers, usage.checks.customers],
                ["Products", usage.usage.products, usage.checks.products],
                ["Branches", usage.usage.branches, usage.checks.branches],
                ["Users", usage.usage.users, usage.checks.users],
                ["Devices", usage.usage.devices, usage.checks.devices],
              ].map(([label, used, check]) => (
                <tr key={String(label)} className="border-b border-slate-50">
                  <td className="py-2 font-medium">{String(label)}</td>
                  <td className="py-2">{String(used)}</td>
                  <td className="py-2">{fmt((check as { limit: number }).limit)}</td>
                  <td className={`py-2 ${!(check as { allowed: boolean }).allowed ? "font-semibold text-rose-600" : ""}`}>
                    {(check as { remaining: number | null }).remaining == null ? "∞" : String((check as { remaining: number }).remaining)}
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
        <CardHeader><CardTitle className="text-sm font-semibold">Activate / renew license</CardTitle></CardHeader>
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
            <Button onClick={() => onActivateToken(token.trim())} disabled={!token.trim()}>Activate / Renew</Button>
            {onStartTrial && <Button variant="outline" onClick={onStartTrial}>Start trial</Button>}
            {onDeactivate && <Button variant="outline" onClick={onDeactivate}>Deactivate</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
