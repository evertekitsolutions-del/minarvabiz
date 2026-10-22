"use client";
import * as React from "react";
import {
  buildServiceVisitSlaReport,exportServiceVisitSlaCsv,
  type ServiceSiteVisit,
} from "@minarvabiz/business-logic";
import {Button} from "../Button";

function friendly(iso:string|null):string{
  return iso?new Date(iso).toLocaleString():"—";
}
/** Manually refreshed, visit-specific calendar deadlines; no background SLA notifications. */
export function ServiceVisitSlaPanel({visits}:{
  visits:readonly ServiceSiteVisit[];
}){
  const [warningMinutes,setWarningMinutes]=React.useState(120);
  const [refreshed,setRefreshed]=React.useState(0);
  void refreshed;
  const report=buildServiceVisitSlaReport(visits,new Date().toISOString(),warningMinutes);
  const tracked=report.rows.filter(row=>row.arrival.dueAt||row.completion.dueAt);
  function download(){
    const csv=exportServiceVisitSlaCsv(report);
    const url=URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");
    link.href=url;link.download="site-visit-sla.csv";link.rel="noopener";
    document.body.appendChild(link);
    try{link.click();}finally{
      link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  }
  return <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
    <summary className="cursor-pointer text-sm font-semibold text-slate-900">
      Field visit deadlines / SLA worksheet ({report.trackedVisits} tracked)
    </summary>
    <p className="mt-2 text-xs text-slate-600">
      These are manually agreed visit arrival and finish deadlines, not contractual
      response-time SLAs. The desktop clock supplies overdue status. There are no
      automated alerts or customer notifications.
    </p>
    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
      <label className="flex items-center gap-1">
        Due-soon warning
        <select aria-label="SLA warning window" value={warningMinutes}
          className="rounded border border-slate-300 bg-white p-1"
          onChange={e=>setWarningMinutes(Number(e.target.value))}>
          <option value={60}>1 hour</option>
          <option value={120}>2 hours</option>
          <option value={240}>4 hours</option>
          <option value={1440}>24 hours</option>
        </select>
      </label>
      <Button size="sm" variant="outline" onClick={()=>setRefreshed(n=>n+1)}>
        Refresh deadline status
      </Button>
      <Button size="sm" variant="outline" disabled={!report.trackedVisits} onClick={download}>
        Export deadline report CSV
      </Button>
    </div>
    <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium text-slate-700">
      <span>Overdue: {report.overdueVisits}</span>
      <span>Due soon: {report.dueSoonVisits}</span>
      <span>Missed targets: {report.missedVisits}</span>
      <span>Cancelled: {report.cancelledVisits}</span>
    </div>
    <div className="mt-2 overflow-auto">
      <table className="w-full min-w-[650px] text-left text-xs">
        <thead><tr className="border-b border-slate-200">
          <th className="p-2">Service / visit</th>
          <th className="p-2">Arrival deadline</th>
          <th className="p-2">Arrival status</th>
          <th className="p-2">Completion deadline</th>
          <th className="p-2">Completion status</th>
        </tr></thead>
        <tbody>{tracked.map(r=><tr key={r.visitId} className="border-b border-slate-200">
          <td className="p-2">{r.orderId} — {r.scheduledOn}</td>
          <td className="p-2">{friendly(r.arrival.dueAt)}</td>
          <td className="p-2">{r.arrival.status.replaceAll("_"," ")}</td>
          <td className="p-2">{friendly(r.completion.dueAt)}</td>
          <td className="p-2">{r.completion.status.replaceAll("_"," ")}</td>
        </tr>)}</tbody>
      </table>
      {!tracked.length&&<p className="p-2 text-xs text-slate-500">
        No visit deadlines yet. Set an optional arrival or completion target when scheduling.
      </p>}
    </div>
  </details>;
}
