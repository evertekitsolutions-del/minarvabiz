"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
import { issueDemoLicense, listIssued, PLAN_FEATURES, PLAN_LIMITS } from "@minarvabiz/licensing";
import type { LicensePlan, Edition } from "@minarvabiz/types";

const PLANS: LicensePlan[] = ["trial", "basic", "professional", "business", "enterprise"];
const EDITIONS: Edition[] = ["online", "offline", "hybrid"];

export default function LicenseAdminHome() {
  const [customerName, setCustomerName] = React.useState("");
  const [plan, setPlan] = React.useState<LicensePlan>("professional");
  const [edition, setEdition] = React.useState<Edition>("hybrid");
  const [issued, setIssued] = React.useState(() => listIssued());
  const [lastToken, setLastToken] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function handleIssue() {
    if (!customerName.trim()) {
      setError("Customer name required");
      return;
    }
    try {
      // Production: call issueLicense with LICENSE_PRIVATE_KEY from server action
      const record = issueDemoLicense({
        customerName: customerName.trim(),
        plan,
        edition,
      });
      setLastToken(record.token);
      setIssued(listIssued());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Issue failed");
    }
  }

  const limits = PLAN_LIMITS[plan];
  const features = PLAN_FEATURES[plan];

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Minarva Biz — License Admin</h1>
          <p className="mt-1 text-sm text-slate-500">
            Issue commercial licenses · Restricted internal tool · Port 3001
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Issue license</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block text-sm">
                <span className="text-slate-600">Customer name</span>
                <input
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Boutique name / owner"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Plan</span>
                <select
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as LicensePlan)}
                >
                  {PLANS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Edition</span>
                <select
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  value={edition}
                  onChange={(e) => setEdition(e.target.value as Edition)}
                >
                  {EDITIONS.map((ed) => (
                    <option key={ed} value={ed}>{ed}</option>
                  ))}
                </select>
              </label>
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <Button onClick={handleIssue}>Issue license</Button>
              {lastToken && (
                <div className="rounded-lg bg-slate-100 p-3">
                  <div className="text-xs font-medium text-slate-500">Token (copy to customer)</div>
                  <code className="mt-1 block break-all text-xs text-slate-800">{lastToken}</code>
                </div>
              )}
              <p className="text-[11px] text-slate-400">
                Demo issuer uses demo: tokens. Production wires issueLicense() with
                LICENSE_PRIVATE_KEY on the server only.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Plan snapshot — {plan}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>Users: {limits.maxUsers < 0 ? "∞" : limits.maxUsers}</div>
                <div>Devices: {limits.maxDevices < 0 ? "∞" : limits.maxDevices}</div>
                <div>Branches: {limits.maxBranches < 0 ? "∞" : limits.maxBranches}</div>
                <div>Products: {limits.maxProducts < 0 ? "∞" : limits.maxProducts}</div>
                <div>Grace days: {limits.graceDays}</div>
                <div>Cloud sync: {limits.cloudSync ? "Yes" : "No"}</div>
              </div>
              <div className="border-t border-slate-100 pt-2">
                <div className="text-xs font-medium uppercase text-slate-400">Features</div>
                <ul className="mt-1 grid grid-cols-2 gap-1 text-xs">
                  {Object.entries(features).map(([k, v]) => (
                    <li key={k} className={v ? "text-emerald-700" : "text-slate-400"}>
                      {v ? "✓" : "✗"} {k}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Issued this session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {issued.length === 0 && (
              <p className="text-sm text-slate-400">No licenses issued yet</p>
            )}
            {issued.map((item, i) => (
              <div key={i} className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm">
                <div className="font-medium">{item.customerName}</div>
                <div className="text-xs text-slate-500">
                  {item.payload.plan} · {item.payload.edition} · {new Date(item.issuedAt).toLocaleString("en-IN")}
                </div>
                <code className="mt-1 block truncate text-[10px] text-slate-400">{item.token}</code>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
