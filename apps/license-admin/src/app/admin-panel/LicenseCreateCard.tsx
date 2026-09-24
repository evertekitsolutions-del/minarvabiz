"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
import type { Edition, LicenseFeatures } from "@minarvabiz/types";
import type { LicensePlan } from "@minarvabiz/licensing";
import { EDITIONS, FEATURE_LABELS, PLANS } from "./model";

interface LicenseCreateCardProps {
  customerName: string;
  plan: LicensePlan;
  edition: Edition;
  expiresAt: string;
  activationLimit: string;
  features: LicenseFeatures;
  message: string | null;
  lastToken: string | null;
  busy: boolean;
  canIssue: boolean;
  onCustomerNameChange: (value: string) => void;
  onPlanChange: (value: LicensePlan) => void;
  onEditionChange: (value: Edition) => void;
  onExpiresAtChange: (value: string) => void;
  onActivationLimitChange: (value: string) => void;
  onFeatureChange: (key: keyof LicenseFeatures, value: boolean) => void;
  onIssue: () => void;
}

export function LicenseCreateCard(props: LicenseCreateCardProps) {
  const {
    customerName,
    plan,
    edition,
    expiresAt,
    activationLimit,
    features,
    message,
    lastToken,
    busy,
    canIssue,
    onCustomerNameChange,
    onPlanChange,
    onEditionChange,
    onExpiresAtChange,
    onActivationLimitChange,
    onFeatureChange,
    onIssue,
  } = props;
  const availableKeys = (Object.keys(features) as (keyof LicenseFeatures)[]).filter(
    (key) => features[key],
  );

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Create customer license</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <input
          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
          placeholder="Customer / organization name"
          value={customerName}
          onChange={(event) => onCustomerNameChange(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <select
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
            value={plan}
            onChange={(event) => onPlanChange(event.target.value as LicensePlan)}
          >
            {PLANS.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
            value={edition}
            onChange={(event) => onEditionChange(event.target.value as Edition)}
          >
            {EDITIONS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            type="datetime-local"
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
            value={expiresAt}
            onChange={(event) => onExpiresAtChange(event.target.value)}
          />
          <input
            type="number"
            min="1"
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
            placeholder="PC activation limit"
            value={activationLimit}
            onChange={(event) => onActivationLimitChange(event.target.value)}
          />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">Allowed features</p>
            <span className="text-xs text-slate-400">{availableKeys.length} enabled</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(Object.keys(features) as (keyof LicenseFeatures)[]).map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(features[key])}
                  onChange={(event) => onFeatureChange(key, event.target.checked)}
                />
                {FEATURE_LABELS[key]}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            You can remove features from the selected plan. A lower plan feature cannot be added accidentally.
          </p>
        </div>
        {message && <p className="text-sm text-rose-600">{message}</p>}
        {!canIssue && (
          <p className="text-xs text-amber-600">Your role is read-only for license issuance.</p>
        )}
        <Button disabled={busy || !customerName.trim() || !canIssue} onClick={onIssue}>
          {busy ? "Generating…" : "Generate License"}
        </Button>
        {lastToken && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-600">Signed license token</p>
            <textarea
              readOnly
              className="min-h-28 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-xs"
              value={lastToken}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
