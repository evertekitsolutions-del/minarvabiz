"use client";
import * as React from "react";
import {
  buildServiceFeedbackInsights,exportServiceFeedbackInsightsCsv,
  type ServiceSiteVisit,
} from "@minarvabiz/business-logic";
import {Button} from "../Button";
import {inputClass} from "../forms/FormField";

/**
 * Staff-recorded feedback only. No automatic survey, review gating,
 * message sending, personal comments or phone numbers in the CSV.
 */
export function ServiceFeedbackInsightsPanel({visits}:{
  visits:readonly ServiceSiteVisit[];
}){
  const [from,setFrom]=React.useState("");
  const [to,setTo]=React.useState("");
  const [refresh,setRefresh]=React.useState(0);
  void refresh;
  const now=new Date();
  const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),
    String(now.getDate()).padStart(2,"0")].join("-");
  let report:ReturnType<typeof buildServiceFeedbackInsights>|null=null;
  let issue:string|null=null;
  try{report=buildServiceFeedbackInsights(visits,today,from||undefined,to||undefined);}
  catch(e){issue=e instanceof Error?e.message:"Could not calculate feedback summary";}
  function download(){
    if(!report)return;
    const csv=exportServiceFeedbackInsightsCsv(report);
    const url=URL.createObjectURL(new Blob(["\uFEFF",csv],{
      type:"text/csv;charset=utf-8",
    }));
    const a=document.createElement("a");
    a.href=url;a.download="field-service-feedback-insights.csv";a.rel="noopener";
    document.body.appendChild(a);
    try{a.click();}
    finally{a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }
  return <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
    <summary className="cursor-pointer text-sm font-semibold text-slate-900">
      Customer feedback insights & follow-up ({report?.completedVisits??0} completed visits)
    </summary>
    <p className="mt-2 text-xs text-slate-600">
      Branch-only, staff-confirmed service feedback. Unverified surveys and
      public Google reviews are not counted. This worksheet never contacts
      customers automatically or restricts review invitations by rating.
    </p>
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="text-xs font-medium">Visit completed from (UTC)
        <input type="date" aria-label="Feedback completed from" value={from}
          className={inputClass+" mt-1"} onChange={e=>setFrom(e.target.value)}/>
      </label>
      <label className="text-xs font-medium">Visit completed through (UTC)
        <input type="date" aria-label="Feedback completed through" value={to}
          className={inputClass+" mt-1"} onChange={e=>setTo(e.target.value)}/>
      </label>
      <Button variant="outline" size="sm" onClick={()=>setRefresh(x=>x+1)}>
        Refresh feedback status
      </Button>
      <Button variant="outline" size="sm" disabled={!report||report.completedVisits===0}
        onClick={download}>Export feedback / follow-up CSV</Button>
    </div>
    {issue&&<p role="alert" className="mt-2 text-xs text-rose-700">{issue}</p>}
    {report&&<>
      <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium text-slate-800">
        <span>Responses: {report.rated+report.declined}/{report.responseEligibleVisits}
          {" "}({report.responsePercent===null?"—":report.responsePercent.toFixed(1)+"%"})</span>
        <span>Average: {report.averageRating===null?"—":report.averageRating.toFixed(2)+"/5"}</span>
        <span>Awaiting: {report.awaitingFeedback}</span>
        <span>Declined: {report.declined}</span>
        <span>Low ratings: {report.lowRatings}</span>
        <span>Recovery overdue: {report.recoveryOverdue}</span>
      </div>
      {report.legacyUntracked>0&&<p className="mt-1 text-xs text-slate-600">
        {report.legacyUntracked} historical visits have no feedback-tracking field
        and are excluded from the response-rate denominator.
      </p>}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {report.ratingCounts.map((count,i)=><div key={i}
          className="rounded border border-slate-200 bg-white p-2 text-xs">
          <p className="font-medium">{i+1} stars — {count}</p>
          <div className="mt-1 h-2 overflow-hidden rounded bg-slate-100">
            <div className="h-full bg-slate-500"
              style={{width:(report.rated?100*count/report.rated:0)+"%"}}/>
          </div>
        </div>)}
      </div>
      <div className="mt-3 overflow-auto">
        <table className="w-full min-w-[430px] text-left text-xs">
          <thead><tr className="border-b border-slate-200">
            <th className="p-2">Completion month (UTC)</th>
            <th className="p-2">Completed</th><th className="p-2">Rated</th>
            <th className="p-2">Declined</th><th className="p-2">1–2 stars</th>
          </tr></thead>
          <tbody>{report.months.map(m=><tr key={m.month}
            className="border-b border-slate-100">
            <td className="p-2">{m.month}</td><td className="p-2">{m.completed}</td>
            <td className="p-2">{m.rated}</td><td className="p-2">{m.declined}</td>
            <td className="p-2">{m.lowRatings}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <details className="mt-3 rounded border border-slate-200 bg-white p-2">
        <summary className="cursor-pointer text-xs font-semibold">
          Manual follow-up queue ({report.actions.length})
        </summary>
        <p className="mt-2 text-xs text-slate-500">
          Staff action required; visit IDs link to the field service register below.
          None of these items triggers a message, review request or customer notification.
        </p>
        <div className="max-h-52 overflow-auto">
          {report.actions.map(a=><p key={a.visitId+":"+a.kind}
            className="border-t border-slate-100 py-1 text-xs">
            {a.kind.replaceAll("_"," ")} · Order {a.orderId} ·
            {" "}Visit {a.visitId} · Completed {a.completedOn}
            {a.dueOn?" · Due "+a.dueOn:""}
          </p>)}
        </div>
      </details>
    </>}
  </details>;
}
