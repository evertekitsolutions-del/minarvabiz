"use client";
import * as React from "react";
import {
  can, currentLaundryRateCatalogBranchId, exportLaundryRateCardCsv,
  importLaundryRateCardCsv, listLaundryRateCards, previewLaundryRateCardCsv,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";

interface PendingRates { csv: string; branchId: string; count: number }

/** Explicit admin-reviewed tariff CSV import; no network, payments or migration. */
export function LaundryRateCatalogPanel() {
  const [pending, setPending] = React.useState<PendingRates | null>(null);
  const [feedback, setFeedback] = React.useState<{ error: boolean; message: string } | null>(null);
  const [revision, setRevision] = React.useState(0);
  const allowed = can("settings.manage");
  if (!allowed) return null;

  function downloadCsv() {
    try {
      const csv = exportLaundryRateCardCsv();
      const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff), csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "minarvabiz-laundry-rate-card.csv";
      document.body.appendChild(anchor);
      try { anchor.click(); setFeedback({ error: false, message: "Current branch rate catalog export requested." }); }
      finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (error) {
      setFeedback({ error: true, message: error instanceof Error ? error.message : "Cannot export tariff CSV" });
    }
  }

  async function previewFile(file?: File) {
    setPending(null);
    setFeedback(null);
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setFeedback({ error: true, message: "Rate CSV exceeds 2 MB" });
      return;
    }
    try {
      const csv = await file.text();
      const branchId = currentLaundryRateCatalogBranchId();
      if (!branchId) throw new Error("Select an active branch first");
      const preview = previewLaundryRateCardCsv(csv);
      if (preview.errors.length) {
        setFeedback({ error: true, message: preview.errors.slice(0, 5).join("; ") });
        return;
      }
      setPending({ csv, branchId, count: preview.rows.length });
      setFeedback({ error: false, message: preview.rows.length + " valid rate(s) ready. Confirm import to create/update tariffs." });
    } catch (error) {
      setFeedback({ error: true, message: error instanceof Error ? error.message : "Cannot read rate CSV" });
    }
  }

  function commitImport() {
    if (!pending) return;
    const result = importLaundryRateCardCsv(pending.csv, pending.branchId);
    if (result.errors.length) {
      setFeedback({ error: true, message: result.errors.slice(0, 5).join("; ") });
      setPending(null);
      return;
    }
    setPending(null);
    setRevision(n => n + 1);
    setFeedback({ error: false, message: "Rate catalog saved: " + result.created + " new, " + result.updated + " updated. Existing rate IDs preserved." });
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-3" aria-label="Laundry rate catalog CSV">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-sm font-semibold text-slate-900">Garment & supplier rate catalog</h3>
        <p className="text-xs text-slate-500">Active-branch tariffs · offline CSV template, preview and bulk import · {revision >= 0 ? listLaundryRateCards().length : 0} rates</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={downloadCsv}>Export rates CSV / template</Button>
        <label className="cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700">
          Choose rates CSV
          <input type="file" accept=".csv,text/csv" aria-label="Choose laundry rate catalog CSV" className="sr-only" onChange={e => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            void previewFile(file);
          }} />
        </label>
      </div>
    </div>
    {pending && <div className="mt-3 flex flex-wrap items-center gap-2">
      <p className="text-xs font-medium text-slate-700">{pending.count} rate(s) validated for the selected branch.</p>
      <Button size="sm" onClick={commitImport}>Import {pending.count} validated rates</Button>
      <Button size="sm" variant="outline" onClick={() => { setPending(null); setFeedback(null); }}>Cancel import</Button>
    </div>}
    {feedback && <p className={"mt-2 text-xs " + (feedback.error ? "text-rose-700" : "text-slate-600")} role={feedback.error ? "alert" : "status"}>{feedback.message}</p>}
  </section>;
}
