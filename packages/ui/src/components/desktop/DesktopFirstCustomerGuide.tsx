"use client";

import * as React from "react";
import {
  can, getOnboardingSteps, getShopProfile, markOnboardingDone,
  unmarkOnboardingDone, phase5Store, store,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { DesktopFirstCustomerCsvImport } from "./DesktopFirstCustomerCsvImport";
import { buildOpeningBalanceReviewCsv, compareOpeningBalanceReviewCsv,
  buildOpeningBalanceExceptionReportCsv,
  type OpeningBalanceReviewResult } from "./opening-balance-review";
import type { NavItemId } from "../../lib/nav";
import {
  firstCustomerEvidence, firstCustomerReviewCounts, firstCustomerRoutes,
  type FirstCustomerSignals, type FirstCustomerStepId,
} from "./first-customer-guide-model";

type NativeGuideApi = {
  getLicenseState?: () => Promise<{ status?: string }>;
  listBackups?: () => Promise<Array<{ verified?: boolean }>>;
};
type GuideWindow = Window & {
  minarvaDesktop?: NativeGuideApi;
  __minarvaDesktopFlush?: () => Promise<boolean>;
};

function currentOpeningBalances() {
  return {
    customers: store.listCustomers().map(({ id, name, outstandingBalance }) =>
      ({ id, name, outstandingBalance })),
    suppliers: phase5Store.listSuppliers().map(({ id, name, outstandingBalance }) =>
      ({ id, name, outstandingBalance })),
  };
}

function observedLocalData(): FirstCustomerSignals {
  const shop = getShopProfile();
  return {
    shopName: shop.shopName || "",
    shopPhone: shop.phone || "",
    shopAddress: shop.address || "",
    products: store.listProducts().length,
    customers: store.listCustomers().length,
    suppliers: phase5Store.listSuppliers().length,
    licenseStatus: null,
    verifiedNativeBackups: null,
  };
}

/** Link the existing desktop modules into a persistent first-customer journey. */
export function DesktopFirstCustomerGuide({ onNavigate }: {
  onNavigate?: (href: string, id: NavItemId) => void;
}) {
  const [revision, setRevision] = React.useState(0);
  const [nativeEvidence, setNativeEvidence] = React.useState<Pick<FirstCustomerSignals, "licenseStatus" | "verifiedNativeBackups">>({
    licenseStatus: null, verifiedNativeBackups: null,
  });
  const [busy, setBusy] = React.useState(false);
  const [unsavedReview, setUnsavedReview] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [balanceReview, setBalanceReview] = React.useState<OpeningBalanceReviewResult | null>(null);
  const [balanceReviewName, setBalanceReviewName] = React.useState("");
  const [balanceReviewCsv, setBalanceReviewCsv] = React.useState<string | null>(null);
  const [balanceReviewError, setBalanceReviewError] = React.useState<string | null>(null);
  const [balanceReviewBusy, setBalanceReviewBusy] = React.useState(false);

  const reloadNative = React.useCallback(async () => {
    const native = (window as GuideWindow).minarvaDesktop;
    const [license, backups] = await Promise.allSettled([
      native?.getLicenseState?.() ?? Promise.resolve(null),
      can("backup.manage") ? (native?.listBackups?.() ?? Promise.resolve(null)) : Promise.resolve(null),
    ]);
    setNativeEvidence({
      licenseStatus: license.status === "fulfilled" ? license.value?.status ?? null : null,
      verifiedNativeBackups: backups.status === "fulfilled" && Array.isArray(backups.value)
        ? backups.value.filter((b) => b.verified === true).length
        : null,
    });
  }, []);

  React.useEffect(() => { void reloadNative(); }, [reloadNative]);

  const steps = getOnboardingSteps();
  const signals = { ...observedLocalData(), ...nativeEvidence };
  const counts = firstCustomerReviewCounts(steps, signals);
  const needsGuide = counts.reviewed < counts.total || counts.evidenceSupported < counts.total || unsavedReview;
  void revision;

  // The guide is not a release gate and never labels checklist confirmations as UAT.
  async function saveReview(id: FirstCustomerStepId, done: boolean) {
    if (busy || unsavedReview || !can("settings.manage")) return;
    const signal = firstCustomerEvidence(id, signals);
    if (!done && signal.requiresEvidence && !signal.observed) {
      setError("Complete the linked step and refresh evidence before confirming.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const accepted = done ? unmarkOnboardingDone(id) : markOnboardingDone(id);
      if (!accepted) throw new Error("Onboarding confirmation rejected");
      setUnsavedReview(true);
      setRevision((n) => n + 1);
      await flushReview();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function flushReview(): Promise<void> {
    const flush = (window as GuideWindow).__minarvaDesktopFlush;
    if (!flush || await flush() !== true) {
      throw new Error("Onboarding confirmation has NOT been saved to SQLite. Keep Minarva Biz open and use Retry save.");
    }
    setUnsavedReview(false);
    setError(null);
  }

  async function retrySave() {
    if (busy || !unsavedReview) return;
    setBusy(true);
    try { await flushReview(); } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }

  function downloadBalanceReview() {
    if (!can("settings.manage")) {
      setError("Only authorized business administrators can export party balances.");
      return;
    }
    try {
      const csv = buildOpeningBalanceReviewCsv(currentOpeningBalances());
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "minarvabiz-outstanding-balance-review.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function uploadBalanceReview(file?: File) {
    if (!file || balanceReviewBusy) return;
    if (!can("settings.manage")) {
      setBalanceReviewError("Only authorized administrators can review financial balances.");
      return;
    }
    setBalanceReview(null);
    setBalanceReviewCsv(null);
    setBalanceReviewError(null);
    setBalanceReviewName(file.name);
    if (file.size > 8 * 1024 * 1024) {
      setBalanceReviewError("Review worksheet exceeds the 8 MB file limit.");
      return;
    }
    setBalanceReviewBusy(true);
    try {
      const worksheet = await file.text();
      const review = compareOpeningBalanceReviewCsv(worksheet, currentOpeningBalances());
      setBalanceReview(review);
      if (review.ok) setBalanceReviewCsv(worksheet);
    } catch (cause) {
      setBalanceReviewError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBalanceReviewBusy(false);
    }
  }

  function downloadBalanceExceptionReport() {
    if (!can("settings.manage")) {
      setBalanceReviewError("Only authorized administrators can export reviewed financial balances.");
      return;
    }
    if (!balanceReviewCsv || balanceReviewBusy) {
      setBalanceReviewError("Upload a valid review worksheet before downloading the accountant report.");
      return;
    }
    try {
      // The source data may have changed after upload. Refuse a stale handoff.
      const fresh = compareOpeningBalanceReviewCsv(balanceReviewCsv, currentOpeningBalances());
      setBalanceReview(fresh);
      if (!fresh.ok) {
        setBalanceReviewCsv(null);
        setBalanceReviewError("Current balances changed since the worksheet was reviewed. Download a new worksheet and reconcile it again.");
        return;
      }
      const csv = buildOpeningBalanceExceptionReportCsv(fresh);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "minarvabiz-opening-balance-exception-report.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBalanceReviewError(null);
    } catch (cause) {
      setBalanceReviewError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function navigate(id: NavItemId, href: string) {
    onNavigate?.(href, id);
  }

  return (
    <section aria-label="First customer setup guide" className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">First customer setup</h2>
          <p className="text-sm text-slate-600">{counts.reviewed} of {counts.total} operator confirmations · {counts.evidenceSupported} supported by current evidence</p>
        </div>
        <Button type="button" variant="outline" onClick={() => { setExpanded(!expanded); void reloadNative(); }}>
          {expanded ? "Hide setup steps" : needsGuide ? "Continue setup" : "Review setup"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">A saved confirmation records an operator review, not tested Windows/Online/Hybrid acceptance, validated accounting or a customer release.</p>
      {unsavedReview && <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        The last checklist change is not confirmed on disk. Keep this app open.
        <Button type="button" variant="outline" disabled={busy} onClick={() => void retrySave()}>Retry save</Button>
      </div>}
      {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
      {expanded && <div className="mt-4 space-y-2">
        {steps.map(step => {
          const id = step.id as FirstCustomerStepId;
          const route = firstCustomerRoutes[id];
          if (!route) return null;
          const evidence = firstCustomerEvidence(id, signals);
          return <div key={id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
            <div className="min-w-[190px] flex-1">
              <p className="text-sm font-semibold text-slate-900">{route.title}</p>
              <p className="text-xs text-slate-600">{route.hint}</p>
              <p className="mt-1 text-xs text-slate-500">{evidence.description} · {step.done ? "Operator reviewed" : "Not yet confirmed"}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => navigate(id === "suppliers" ? "suppliers" : route.href.substring(1) as NavItemId, route.href)}>Open</Button>
              <Button type="button" size="sm" disabled={busy || unsavedReview || !can("settings.manage") || (!step.done && evidence.requiresEvidence && !evidence.observed)}
                onClick={() => void saveReview(id, step.done)}>{step.done ? "Undo review" : "Confirm reviewed"}</Button>
            </div>
          </div>;
        })}
        <DesktopFirstCustomerCsvImport onSaved={() => { setBalanceReview(null); setBalanceReviewCsv(null); setRevision(n => n + 1); }} />
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-900">Outstanding balance reconciliation</p>
          <p className="mt-1 text-xs text-slate-600">Download a read-only worksheet with current customer receivables and supplier payables. Enter externally verified amounts and review notes in the spreadsheet. This does not import balances, post ledgers or prove opening-balance reconciliation.</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm"
              disabled={!can("settings.manage")} onClick={downloadBalanceReview}>
              Download outstanding review CSV
            </Button>
            <label className={"cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-xs " +
              (balanceReviewBusy || !can("settings.manage") ? "opacity-50" : "")}>
              {balanceReviewBusy ? "Checking worksheet..." : "Review completed CSV"}
              <input type="file" accept=".csv,text/csv" className="sr-only"
                aria-label="Review completed outstanding balance CSV"
                disabled={balanceReviewBusy || !can("settings.manage")}
                onChange={e => {
                  const selected = e.target.files?.[0]; e.target.value = "";
                  void uploadBalanceReview(selected);
                }} />
            </label>
          </div>
          {balanceReviewError && <p role="alert" className="mt-2 text-xs text-rose-700">{balanceReviewError}</p>}
          {balanceReview && <div className="mt-3 space-y-2 text-xs text-slate-700">
            <p>Reviewed file: {balanceReviewName}. Read-only comparison against currently loaded balances.</p>
            {balanceReview.ok && <Button type="button" variant="outline" size="sm"
              disabled={!balanceReviewCsv || balanceReviewBusy || !can("settings.manage")}
              onClick={downloadBalanceExceptionReport}>
              Download accountant reconciliation report
            </Button>}
            {balanceReview.ok
              ? <p role="status">{balanceReview.matched} matched · {balanceReview.discrepancies} discrepancies · {balanceReview.pending} pending out of {balanceReview.total} parties.</p>
              : <p role="alert" className="text-rose-700">Worksheet rejected. No balances were changed.</p>}
            {balanceReview.errors.length > 0 && <ul className="list-disc space-y-1 pl-5 text-rose-700">
              {balanceReview.errors.slice(0, 10).map((problem, index) =>
                <li key={index}>{problem}</li>)}
              {balanceReview.errors.length > 10 && <li>Additional errors omitted.</li>}
            </ul>}
            {balanceReview.ok && balanceReview.discrepancies > 0 &&
              <div className="max-h-40 overflow-auto rounded-md border border-amber-200 bg-white p-2">
                {balanceReview.rows.filter(r => r.state === "discrepancy").slice(0, 20).map(r =>
                  <p key={r.kind + r.id}>{r.kind}: {r.name} — recorded {r.current.toFixed(2)},
                    verified {r.verified?.toFixed(2)}, difference {r.difference?.toFixed(2)}</p>)}
              </div>}
            <p>Download reports are recalculated against current balances at export time. They do not constitute accountant approval. Comparison results are not posted to accounting, saved as verified UAT, or persisted as approval.
              Re-upload after any change to live balances. Resolve discrepancies through authorized accounting workflows.</p>
          </div>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {([
            ["accounting", "Opening bank & accounts"], ["sales", "Create first invoice"],
            ["payments", "Collect payment"], ["settings", "Test invoice printing"],
            ["backup", "Backup / Restore"], ["support", "Request support"],
          ] as const).map(([id, title]) => <Button key={id} type="button" variant="outline" size="sm" onClick={() => navigate(id, "/" + id)}>{title}</Button>)}
        </div>
        <p className="text-xs text-slate-600">Before customer delivery: test actual printing, sale/payment settlement, offline restart, backup restore and licensed Windows/Hybrid operation. Operator confirmations alone do not validate these workflows.</p>
      </div>}
    </section>
  );
}
