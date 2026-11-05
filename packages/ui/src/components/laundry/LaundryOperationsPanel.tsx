"use client";
import * as React from "react";
import type { LaundryOrder } from "@minarvabiz/types";
import { buildLaundryOperationsReport, exportLaundryOperationsCsv } from "@minarvabiz/business-logic";
import { formatMoney } from "../customers/format";
import { inputClass } from "../forms/FormField";
import { Button } from "../Button";

function monthNow(): string {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0")].join("-");
}

export function LaundryOperationsPanel({ orders }: { orders: LaundryOrder[] }) {
  const [period, setPeriod] = React.useState(monthNow);
  const [expanded, setExpanded] = React.useState(false);
  const [exportFeedback, setExportFeedback] = React.useState<{error:boolean;text:string}|null>(null);
  const report = React.useMemo(() => {
    if (!/^\d{4}-\d{2}$/.test(period)) return null;
    const [year, month] = period.split("-").map(Number);
    if (month < 1 || month > 12 || year < 2000 || year > 9999) return null;
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const today = new Date();
    const asOfDay = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
    try { return buildLaundryOperationsReport(orders, period + "-01", end, asOfDay); }
    catch { return null; }
  }, [orders, period]);

  function downloadMonthlyCsv() {
    if (!report) { setExportFeedback({error:true,text:"Select a valid reporting month first."}); return; }
    try {
      const csv = exportLaundryOperationsCsv(report);
      const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff), csv],{type:"text/csv;charset=utf-8"}));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "minarvabiz-laundry-operations-" + period + ".csv";
      document.body.appendChild(anchor);
      try { anchor.click(); setExportFeedback({error:false,text:"Monthly operations CSV export requested."}); }
      finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (error) {
      setExportFeedback({error:true,text:error instanceof Error ? error.message : "Unable to export operations report"});
    }
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-sm font-semibold text-slate-900">Laundry operations & garment throughput</h3>
        <p className="text-xs text-slate-500">Month of ticket intake · active workload and service mix</p></div>
      <div className="flex gap-2">
        <input aria-label="Laundry reporting month" type="month" className={inputClass} value={period} onChange={e => setPeriod(e.target.value)} />
        <Button variant="outline" size="sm" disabled={!report} onClick={downloadMonthlyCsv}>Export month CSV</Button>
        <Button variant="outline" size="sm" onClick={() => setExpanded(value => !value)}>{expanded ? "Hide report" : "View report"}</Button>
      </div>
    </div>
    {exportFeedback && <p className={"mt-2 text-xs " + (exportFeedback.error ? "text-rose-700" : "text-slate-600")} role={exportFeedback.error ? "alert" : "status"}>{exportFeedback.text}</p>}
    {expanded && (report ? <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {([
          ["Booked tickets",report.bookedTickets],["Open",report.activeTickets],["Delivered",report.deliveredTickets],
          ["Overdue open",report.overdueOpenTickets],["Garment pieces",report.garmentPieces],
          ["Failed QC pieces",report.failedQcGarmentPieces],
        ] as Array<[string,number]>).map(([name,value]) => <div key={name} className="rounded-lg bg-slate-50 p-2">
          <div className="text-xs text-slate-500">{name}</div><strong className="text-lg text-slate-900">{value}</strong>
        </div>)}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 p-2"><span className="text-xs text-slate-600">Booked customer charge</span><div className="font-semibold">{formatMoney(report.bookedCustomerCharge)}</div></div>
        <div className="rounded-lg border border-slate-200 p-2"><span className="text-xs text-slate-600">Supplier commitment</span><div className="font-semibold">{formatMoney(report.supplierCommitment)}</div></div>
        <div className="rounded-lg border border-slate-200 p-2"><span className="text-xs text-slate-600">Contribution before overhead</span><div className="font-semibold">{formatMoney(report.contributionBeforeOverhead)}</div></div>
      </div>
      <p className="text-xs text-slate-500">{report.inHouseTickets} in-house · {report.outsourcedTickets} outsourced · {report.deliveredGarmentPieces} itemized pieces delivered. Cancelled tickets excluded. This is an operational booking view, not the reconciled financial ledger.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div><h4 className="mb-1 text-xs font-semibold">Garment processing stages</h4>
          <div className="space-y-1">{Object.entries(report.stages).map(([stage,count]) => <div key={stage} className="flex justify-between border-b border-slate-100 py-1 text-xs"><span>{stage.replaceAll("_"," ")}</span><span>{count} pieces</span></div>)}</div>
        </div>
        <div><h4 className="mb-1 text-xs font-semibold">Garments by service</h4>
          <div className="space-y-1">{report.serviceVolumes.length ? report.serviceVolumes.map(row => <div key={row.service} className="flex justify-between border-b border-slate-100 py-1 text-xs"><span>{row.service.replaceAll("_"," ")}</span><span>{row.garmentCount} pieces · {row.tickets} tickets</span></div>) : <p className="text-xs text-slate-500">No tickets this month</p>}</div>
        </div>
      </div>
    </div> : <p role="alert" className="mt-2 text-sm text-rose-700">Unable to calculate the report. Check the selected month and ticket data.</p>)}
  </section>;
}
