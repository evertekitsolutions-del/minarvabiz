"use client";
import * as React from "react";
import type {ServiceOrder} from "@minarvabiz/types";
import {
  can,calculateServiceJobCostReport,exportServiceJobCostReportCsv,
  type ServiceSiteVisit,
} from "@minarvabiz/business-logic";
import {Button} from "../Button";

/**
 * Informational service profitability range, not a financial journal or a
 * statement of realized profit. Revenue is current order price, not receipts.
 * Parts used may overlap with existing service-order expense totals.
 */
export function ServiceJobCostPanel({orders,visits}:{
  orders:readonly ServiceOrder[];visits:readonly ServiceSiteVisit[];
}){
  const authorized=can("accounting.view");
  let report:ReturnType<typeof calculateServiceJobCostReport>|null=null;
  let reportError:string|null=null;
  if(authorized){
    try{report=calculateServiceJobCostReport(orders,visits);}
    catch(e){reportError=e instanceof Error?e.message:"Job cost worksheet failed";}
  }
  if(!authorized)return null;
  function download(){
    if(!report)return;
    const csv=exportServiceJobCostReportCsv(report);
    const url=URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");
    link.href=url;link.download="field-service-job-cost-estimates.csv";link.rel="noopener";
    document.body.appendChild(link);
    try{link.click();}finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }
  const cash=(minor:number)=>(minor/100).toFixed(2);
  return <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
    <summary className="cursor-pointer text-sm font-semibold text-slate-900">
      Field service job cost & profit estimates ({report?.jobCount??0} jobs)
    </summary>
    <p className="mt-2 text-xs text-slate-600">
      Indicative order-level net value less recorded direct costs.
      Since installed parts may already appear in order material/expense costs,
      we show a lower and upper estimate instead of counting them twice.
      Figures use the shop's configured currency and are not verified
      collected cash, tax profit, or posted accounting balances.
    </p>
    {reportError&&<p role="alert" className="text-xs text-rose-700">{reportError}</p>}
    {report&&<>
      <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium text-slate-700">
        <span>Order value: {cash(report.totalOrderValueMinor)}</span>
        <span>Existing costs: {cash(report.existingCostsMinor)}</span>
        <span>Parts-used reference: {cash(report.recordedPartsCostMinor)}</span>
        <span>Profit estimate range: {cash(report.lowerEstimatedProfitMinor)}
          {" "} to {cash(report.upperEstimatedProfitMinor)}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {report.visitCount} active visits included. {report.excludedVisitCount} cancelled or unavailable visits excluded.
        Overhead, salaries not entered as order costs, taxes and warehouse posting are excluded.
      </p>
      <Button size="sm" variant="outline" disabled={!report.jobCount}
        onClick={download}>Export job cost estimates CSV</Button>
      <div className="mt-2 max-h-80 overflow-auto">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead><tr className="border-b border-slate-200">
            <th className="p-2">Service job</th>
            <th className="p-2">Order value</th>
            <th className="p-2">Recorded order costs</th>
            <th className="p-2">Part-use reference</th>
            <th className="p-2">Estimated profit band</th>
            <th className="p-2">Margin range</th>
          </tr></thead>
          <tbody>{report.rows.map(r=><tr key={r.orderId} className="border-b border-slate-200">
            <td className="p-2">{r.orderNumber} — {r.customerName}
              <span className="block text-slate-500">{r.status}, {r.visitCount} visits</span></td>
            <td className="p-2">{cash(r.orderPriceMinor)}</td>
            <td className="p-2">{cash(r.existingMaterialCostMinor+
              r.existingExpenseCostMinor)}</td>
            <td className="p-2">{cash(r.partsUsedCostMinor)}
              <span className="block text-slate-500">{r.partLineCount} active,
                {" "}{r.correctedPartLines} corrected</span></td>
            <td className="p-2">{cash(r.lowerEstimatedProfitMinor)} to
              {" "}{cash(r.upperEstimatedProfitMinor)}</td>
            <td className="p-2">{r.lowerMarginPercent===null?"—":r.lowerMarginPercent+"%"}
              {" "} to {r.upperMarginPercent===null?"—":r.upperMarginPercent+"%"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!report.rows.length&&<p className="mt-2 text-xs text-slate-500">
        No non-cancelled service visits with matching branch-linked orders.
      </p>}
    </>}
  </details>;
}
