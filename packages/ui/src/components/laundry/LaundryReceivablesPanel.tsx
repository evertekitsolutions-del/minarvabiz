"use client";
import * as React from "react";
import type { LaundryOrder } from "@minarvabiz/types";
import {
  buildLaundryReceivablesAgeing, can, exportLaundryReceivablesAgeingCsv,
} from "@minarvabiz/business-logic";
import { formatMoney } from "../customers/format";
import { Button } from "../Button";
import { inputClass } from "../forms/FormField";

function todayLocal(): string {
  const now = new Date();
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");
}
const labels = [
  ["not_due","Not due"],
  ["days_1_7","1–7 days"],
  ["days_8_30","8–30 days"],
  ["days_31_60","31–60 days"],
  ["days_61_plus","61+ days"],
  ["undated","No due date"],
] as const;

/** Operational ageing only: current ticket receivables, not historical AR or a journal. */
export function LaundryReceivablesPanel({ orders }: { orders: LaundryOrder[] }) {
  const [day, setDay] = React.useState(todayLocal);
  const [show, setShow] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ error: boolean; text: string } | null>(null);
  const permitted = can("reports.view");
  const report = React.useMemo(() => {
    if (!permitted) return null;
    try { return buildLaundryReceivablesAgeing(orders, day); }
    catch { return null; }
  }, [orders, day, permitted]);
  if (!permitted) return null;

  function downloadCsv() {
    if (!report) { setFeedback({ error:true, text:"Select a valid date and active branch first." }); return; }
    try {
      const csv = exportLaundryReceivablesAgeingCsv(report);
      const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff),csv],{type:"text/csv;charset=utf-8"}));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "minarvabiz-laundry-receivables-" + day + ".csv";
      document.body.appendChild(anchor);
      try { anchor.click(); setFeedback({error:false,text:"Laundry receivables CSV export requested."}); }
      finally { anchor.remove(); window.setTimeout(()=>URL.revokeObjectURL(url),1000); }
    } catch (error) {
      setFeedback({error:true,text:error instanceof Error?error.message:"Receivables export failed"});
    }
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-3" aria-label="Laundry receivables ageing">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Laundry outstanding ageing</h3>
        <p className="text-xs text-slate-500">Current ticket balances by promised due date · not a reconciled finance ledger</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Laundry ageing date" type="date" className={inputClass} value={day} onChange={event=>setDay(event.target.value)}/>
        <Button size="sm" variant="outline" disabled={!report} onClick={downloadCsv}>Export ageing CSV</Button>
        <Button size="sm" variant="outline" onClick={()=>setShow(v=>!v)}>{show?"Hide ageing":"View ageing"}</Button>
      </div>
    </div>
    {feedback&&<p role={feedback.error?"alert":"status"} className={"mt-2 text-xs "+(feedback.error?"text-rose-700":"text-slate-600")}>{feedback.text}</p>}
    {show&&(report?<div className="mt-3 space-y-3">
      <div className="text-sm font-medium text-slate-800">{report.tickets} unpaid ticket(s) · {formatMoney(report.outstanding)} outstanding</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {labels.map(([key,label])=><div key={key} className="rounded-lg bg-slate-50 p-2">
          <p className="text-xs text-slate-600">{label}</p>
          <p className="font-semibold">{formatMoney(report.buckets[key])}</p>
        </div>)}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead><tr className="border-b text-slate-600"><th className="py-2">Ticket</th><th>Customer</th><th>Status</th><th>Due</th><th>Days overdue</th><th className="text-right">Balance</th></tr></thead>
          <tbody>{report.rows.slice(0,50).map(row=><tr key={row.id} className="border-b border-slate-100">
            <td className="py-2">{row.ticket}</td><td>{row.customerName}</td><td>{row.status}</td><td>{row.dueDate||"Unscheduled"}</td>
            <td>{row.daysOverdue===null?"—":Math.max(0,row.daysOverdue)}</td>
            <td className="text-right">{formatMoney(row.balance)}</td>
          </tr>)}</tbody>
        </table>
        {report.rows.length>50&&<p className="mt-1 text-xs text-slate-500">Showing 50 tickets; CSV includes all {report.rows.length}.</p>}
        {!report.rows.length&&<p className="p-2 text-xs text-slate-500">No unpaid laundry tickets.</p>}
      </div>
    </div>:<p role="alert" className="mt-2 text-xs text-rose-700">Ageing report unavailable; verify branch, date and ticket data.</p>)}
  </section>;
}
