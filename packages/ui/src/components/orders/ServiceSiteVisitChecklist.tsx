"use client";
import * as React from "react";
import {
  startLegacySiteVisitChecklist, setServiceSiteVisitCheck,
  type ServiceSiteVisit, type ServiceSiteVisitCheck, type SiteVisitCheckResult,
} from "@minarvabiz/business-logic";
import {Button} from "../Button";
import {inputClass,selectClass} from "../forms/FormField";

function CheckItemEditor({visit,item,mutate}:{
  visit:ServiceSiteVisit;item:ServiceSiteVisitCheck;
  mutate:(fn:()=>unknown,success:string)=>void;
}){
  const [result,setResult]=React.useState<SiteVisitCheckResult>(item.result);
  const [notes,setNotes]=React.useState(item.notes);
  React.useEffect(()=>{setResult(item.result);setNotes(item.notes);},
    [item.result,item.notes,item.checkedAt]);
  return <div className="grid gap-1 border-t border-slate-100 py-2 first:border-0">
    <span className="font-medium">{item.label}{item.required?" *":""}</span>
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs">Inspection result
        <select aria-label={item.label+" result"} value={result}
          className={selectClass+" mt-1"}
          onChange={e=>setResult(e.target.value as SiteVisitCheckResult)}>
          <option value="pending">Pending</option>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="not_applicable">Not applicable</option>
        </select>
      </label>
      <label className="min-w-36 flex-1 text-xs">Notes / exception reason
        <input aria-label={item.label+" notes"} maxLength={500} value={notes}
          className={inputClass+" mt-1"} onChange={e=>setNotes(e.target.value)}/>
      </label>
      <Button size="sm" variant="outline" onClick={()=>mutate(()=>
        setServiceSiteVisitCheck({visitId:visit.id,expectedVersion:visit.version,
          itemId:item.id,result,notes}),"Checklist response saved")}>
        Save
      </Button>
    </div>
  </div>;
}
/** A checked box represents staff attestation, never independently verified evidence. */
export function ServiceSiteVisitChecklist({visit,canWrite,mutate}:{
  visit:ServiceSiteVisit;canWrite:boolean;
  mutate:(fn:()=>unknown,success:string)=>void;
}){
  if(!visit.checklist){
    return canWrite&&visit.status==="arrived"
      ? <Button size="sm" variant="outline" onClick={()=>mutate(()=>
        startLegacySiteVisitChecklist(visit.id,visit.version),"Legacy visit checklist started")}>
        Start checklist
      </Button> : null;
  }
  const done=visit.checklist.filter(i=>i.result==="passed"||
    i.result==="not_applicable").length;
  return <details className="mt-2 max-w-80 rounded border border-slate-200 bg-white p-2">
    <summary className="cursor-pointer font-medium">
      Inspection checklist ({done}/{visit.checklist.length})
    </summary>
    <p className="my-1 text-xs text-slate-500">
      Required items must pass or have a justified not-applicable exception before completion.
    </p>
    {visit.checklist.map(item=><div key={item.id}>
      {canWrite&&visit.status==="arrived"
        ? <CheckItemEditor visit={visit} item={item} mutate={mutate}/>
        : <p className="border-t border-slate-100 py-1">
          {item.label}: {item.result.replaceAll("_"," ")}
          {item.notes&&<span className="block text-slate-500">{item.notes}</span>}
        </p>}
    </div>)}
  </details>;
}
