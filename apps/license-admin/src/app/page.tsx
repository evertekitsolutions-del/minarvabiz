"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
import {
  issueDemoLicense,
  listIssued,
  PLAN_FEATURES,
  PLAN_LIMITS,
  type IssuedLicense,
} from "@minarvabiz/licensing";
import type { LicensePlan, Edition } from "@minarvabiz/types";

const PLANS: LicensePlan[] = ["trial", "basic", "professional", "business", "enterprise"];
const EDITIONS: Edition[] = ["online", "offline", "hybrid"];

type Managed = IssuedLicense & { status: "active" | "suspended" | "revoked" };

export default function LicenseAdminHome() {
  const [customerName, setCustomerName] = React.useState("");
  const [plan, setPlan] = React.useState<LicensePlan>("professional");
  const [edition, setEdition] = React.useState<Edition>("hybrid");
  const [managed, setManaged] = React.useState<Managed[]>(() =>
    listIssued().map((x) => ({ ...x, status: "active" as const }))
  );
  const [lastToken, setLastToken] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function handleIssue() {
    if (!customerName.trim()) {
      setError("Customer name required");
      return;
    }
    const record = issueDemoLicense({
      customerName: customerName.trim(),
      plan,
      edition,
    });
    setLastToken(record.token);
    setManaged((m) => [{ ...record, status: "active" }, ...m]);
    setError(null);
  }

  function setStatus(token: string, status: Managed["status"]) {
    setManaged((m) => m.map((x) => (x.token === token ? { ...x, status } : x)));
  }

  const limits = PLAN_LIMITS[plan];
  const features = PLAN_FEATURES[plan];

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Minarva Biz — License Admin</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create, issue, suspend, revoke · Port 3001 · Production signing uses LICENSE_PRIVATE_KEY server-side
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
                <code className="block break-all rounded bg-slate-100 p-2 text-xs">{lastToken}</code>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Plan — {plan}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>Users: {limits.maxUsers < 0 ? "∞" : limits.maxUsers}</div>
              <div>Devices: {limits.maxDevices < 0 ? "∞" : limits.maxDevices}</div>
              <div>Branches: {limits.maxBranches < 0 ? "∞" : limits.maxBranches}</div>
              <div>Grace days: {limits.graceDays}</div>
              <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
                {Object.entries(features).map(([k, v]) => (
                  <li key={k} className={v ? "text-emerald-700" : "text-slate-400"}>
                    {v ? "✓" : "✗"} {k}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">License registry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {managed.length === 0 && <p className="text-sm text-slate-400">No licenses yet</p>}
            {managed.map((item) => (
              <div
                key={item.token}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{item.customerName}</div>
                  <div className="text-xs text-slate-500">
                    {item.payload.plan} · {item.payload.edition} · {item.status}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setStatus(item.token, "suspended")}>
                    Suspend
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus(item.token, "revoked")}>
                    Revoke
                  </Button>
                  <Button size="sm" onClick={() => setStatus(item.token, "active")}>
                    Activate
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
