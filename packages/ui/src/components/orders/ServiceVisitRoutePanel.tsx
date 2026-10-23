"use client";
import * as React from "react";
import {
  buildServiceVisitRouteDays,exportServiceRoutePlanCsv,
  googleMapsServiceStopLink,googleMapsServiceRouteLink,
  setServiceSiteVisitRouteSequence,type ServiceSiteVisit,
  type ServiceRouteVisit,
} from "@minarvabiz/business-logic";
import {Button} from "../Button";
import {inputClass} from "../forms/FormField";

function StopEditor({visit,canWrite,mutate}:{
  visit:ServiceRouteVisit&Pick<ServiceSiteVisit,"version">;
  canWrite:boolean;mutate:(fn:()=>unknown,message:string)=>void;
}){
  const [sequence,setSequence]=React.useState(
    visit.routeSequence==null?"":String(visit.routeSequence));
  React.useEffect(()=>{
    setSequence(visit.routeSequence==null?"":String(visit.routeSequence));
  },[visit.routeSequence,visit.version]);
  const parsed=sequence.trim()?Number(sequence):null;
  const valid=parsed===null||Number.isSafeInteger(parsed)&&parsed>=1&&parsed<=100;
  return <div className="flex items-center gap-1">
    {canWrite&&<label className="flex items-center gap-1 text-xs">
      Stop #
      <input type="number" min={1} max={100} step={1} className={inputClass+" w-16"}
        aria-label={"Route stop number "+visit.id} value={sequence}
        onChange={e=>setSequence(e.target.value)}/>
    </label>}
    {canWrite&&<Button size="sm" variant="outline"
      disabled={!valid||visit.routeSequence===(parsed??null)}
      onClick={()=>mutate(()=>setServiceSiteVisitRouteSequence({
        visitId:visit.id,expectedVersion:visit.version,routeSequence:parsed,
      }),"Technician route stop updated")}>Save</Button>}
    <Button size="sm" variant="outline" onClick={()=>{
      window.open(googleMapsServiceStopLink(visit.siteAddress),
        "_blank","noopener,noreferrer");
    }}>Open map</Button>
  </div>;
}
/** Operator-controlled itinerary order; no automatic travel optimization. */
export function ServiceVisitRoutePanel({visits,canWrite,mutate}:{
  visits:readonly ServiceSiteVisit[];canWrite:boolean;
  mutate:(fn:()=>unknown,message:string)=>void;
}){
  const [dateFilter,setDateFilter]=React.useState("");
  let days:ReturnType<typeof buildServiceVisitRouteDays>=[];
  let error:string|null=null;
  try{days=buildServiceVisitRouteDays(visits,dateFilter||undefined);}
  catch(e){error=e instanceof Error?e.message:"Cannot build route list";}
  function exportCsv(){
    const csv=exportServiceRoutePlanCsv(days);
    const url=URL.createObjectURL(new Blob(["\uFEFF",csv],
      {type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;
    a.download="technician-visit-route-worksheet.csv";a.rel="noopener";
    document.body.appendChild(a);
    try{a.click();}finally{a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }
  return <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
    <summary className="cursor-pointer text-sm font-semibold text-slate-900">
      Technician route / stop order ({days.length} technician-days)
    </summary>
    <p className="mt-2 text-xs text-slate-600">
      Manually assign a stop number (1–100) for visits on the same technician/day.
      Dates and addresses come from your existing offline site visits. This is
      not GPS tracking, distance optimization or a guaranteed route/ETA.
    </p>
    <p className="mt-1 text-xs text-amber-700">
      Opening Maps sends the selected customer site addresses to Google
      only after you click. Do not open routes without permission to share
      these site details.
    </p>
    <div className="my-2 flex flex-wrap items-end gap-2">
      <label className="text-xs">Planned day
        <input aria-label="Technician route day" type="date"
          className={inputClass+" mt-1"} value={dateFilter}
          onChange={e=>setDateFilter(e.target.value)}/>
      </label>
      <Button size="sm" variant="outline" onClick={()=>setDateFilter("")}>All days</Button>
      <Button size="sm" variant="outline" disabled={!days.length}
        onClick={exportCsv}>Export route worksheet CSV</Button>
    </div>
    {error&&<p role="alert" className="text-xs text-rose-700">{error}</p>}
    {days.map(day=><div key={day.key} className="mt-2 rounded border border-slate-200 bg-white p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold">
          {day.scheduledOn} — Technician {day.staffId}, {day.stops.length} sites
        </p>
        <Button size="sm" variant="outline" onClick={()=>{
          window.open(googleMapsServiceRouteLink(day.stops.slice(0,8)),
            "_blank","noopener,noreferrer");
        }}>{day.stops.length>8?"Open first 8 stops":"Open route in Maps"}</Button>
      </div>
      {day.stops.length>8&&<p className="text-xs text-amber-700">
        This route contains more than eight sites. The Maps shortcut includes
        only the first eight. Use individual maps or the full CSV for remaining sites.
      </p>}
      {day.unsequenced>0&&<p className="text-xs text-slate-500">
        {day.unsequenced} unsequenced site(s) appear after numbered stops.
      </p>}
      <div className="mt-2 space-y-2">
        {day.stops.map((v,i)=><div key={v.id}
          className="flex flex-wrap items-start justify-between gap-2 border-t border-slate-100 pt-2">
          <p className="max-w-64 text-xs">
            <strong>{v.routeSequence??i+1}. {v.siteAddress}</strong>
            <span className="block text-slate-500">{v.status}</span>
          </p>
          <StopEditor visit={v as ServiceRouteVisit&ServiceSiteVisit}
            canWrite={canWrite} mutate={mutate}/>
        </div>)}
      </div>
    </div>)}
    {days.length===0&&!error&&<p className="mt-2 text-xs text-slate-500">
      No open scheduled or arrived visits for this selection.
    </p>}
  </details>;
}
