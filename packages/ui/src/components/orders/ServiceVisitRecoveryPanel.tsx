"use client";
import * as React from "react";
import {
  can,openServiceVisitRecovery,confirmServiceVisitRecoveryContact,
  closeServiceVisitRecovery,summarizeServiceVisitRecovery,
  type ServiceSiteVisit,type RecoveryContactMethod,
} from "@minarvabiz/business-logic";
import {Button} from "../Button";
import {inputClass,selectClass} from "../forms/FormField";

function localDate():string{
  const now=new Date();
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),
    String(now.getDate()).padStart(2,"0")].join("-");
}
/** Branch list is already scoped by reports.view; summary never sends data externally. */
export function ServiceRecoverySummary({visits}:{
  visits:readonly ServiceSiteVisit[];
}){
  const today=localDate();
  const values=summarizeServiceVisitRecovery(visits.map(v=>v.recovery),today);
  return <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs">
    <span className="font-semibold">Customer service recovery:</span>
    {" "}{values.open} open · {values.contacted} contacted ·
    {" "}{values.overdue} overdue · {values.resolved} resolved ·
    {" "}{values.closedUnresolved} closed unresolved
    <p className="mt-1 text-slate-500">
      Staff-managed follow-up on customer ratings 1–2/5. No automatic calls,
      WhatsApp messages or delivery claims.
    </p>
  </div>;
}
export function ServiceVisitRecoveryPanel({visit,canWrite,mutate}:{
  visit:ServiceSiteVisit;canWrite:boolean;
  mutate:(fn:()=>unknown,success:string)=>void;
}){
  const [dueOn,setDueOn]=React.useState(localDate);
  const [plan,setPlan]=React.useState("");
  const [method,setMethod]=React.useState<RecoveryContactMethod>("phone");
  const [contactNotes,setContactNotes]=React.useState("");
  const [outcome,setOutcome]=React.useState<"resolved"|"closed_unresolved">("resolved");
  const [outcomeNotes,setOutcomeNotes]=React.useState("");
  if(!can("reports.view")||visit.status!=="completed"||
    visit.feedback?.outcome!=="rated"||visit.feedback.rating===null||
    visit.feedback.rating>2||!Object.hasOwn(visit,"recovery"))return null;
  const recovery=visit.recovery;
  const editable=canWrite&&can("orders.assign");
  const isOverdue=Boolean(recovery&&["open","contacted"].includes(recovery.status)&&
    recovery.dueOn<localDate());
  return <details className="mt-2 max-w-[600px] rounded border border-amber-200 bg-amber-50 p-2">
    <summary className="cursor-pointer text-xs font-semibold">
      Private customer recovery: {recovery?.status.replaceAll("_"," ")??"not started"}
      {isOverdue?" — overdue":""}
    </summary>
    <p className="mt-2 text-xs text-slate-600">
      Track an actual recovery conversation after the customer’s 1–2 star rating.
      Customer contact and final resolution must be confirmed manually.
    </p>
    {!recovery&&editable&&<div className="mt-2 space-y-2">
      <label className="block text-xs font-medium">Follow-up due date
        <input aria-label={"Recovery due date "+visit.id} type="date" min={localDate()}
          value={dueOn} onChange={e=>setDueOn(e.target.value)}
          className={inputClass+" mt-1"}/>
      </label>
      <label className="block text-xs font-medium">Customer recovery action plan
        <textarea aria-label={"Recovery plan "+visit.id} rows={2}
          maxLength={800} value={plan} className={inputClass+" mt-1"}
          onChange={e=>setPlan(e.target.value)}/>
      </label>
      <Button size="sm" variant="outline"
        disabled={!dueOn||plan.trim().length<3||dueOn<localDate()}
        onClick={()=>mutate(()=>openServiceVisitRecovery({
          visitId:visit.id,expectedVersion:visit.version,dueOn,plan,
        }),"Private recovery case opened in offline register")}>
        Open recovery case
      </Button>
    </div>}
    {recovery&&<div className="mt-2 space-y-1 text-xs">
      <p>Due: <strong>{recovery.dueOn}</strong></p>
      <p>Action plan: {recovery.plan}</p>
      {recovery.contactedAt&&<p>Staff-confirmed contact:
        {" "}{recovery.contactMethod?.replace("_"," ")} ·
        {" "}{new Date(recovery.contactedAt).toLocaleString()}</p>}
      {recovery.contactNotes&&<p>Contact note: {recovery.contactNotes}</p>}
      {recovery.resolvedAt&&<p>Closed:
        {" "}{new Date(recovery.resolvedAt).toLocaleString()}</p>}
      {recovery.outcomeNotes&&<p>Result: {recovery.outcomeNotes}</p>}
    </div>}
    {recovery?.status==="open"&&editable&&<div className="mt-3 space-y-2">
      <label className="block text-xs font-medium">Actual customer contact channel
        <select aria-label={"Recovery contact method "+visit.id} value={method}
          onChange={e=>setMethod(e.target.value as RecoveryContactMethod)}
          className={selectClass+" mt-1"}>
          <option value="phone">Phone</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="in_person">In person</option>
        </select>
      </label>
      <label className="block text-xs font-medium">Staff-confirmed contact result
        <textarea aria-label={"Recovery contact notes "+visit.id} rows={2}
          className={inputClass+" mt-1"} maxLength={1000}
          value={contactNotes} onChange={e=>setContactNotes(e.target.value)}/>
      </label>
      <Button size="sm" variant="outline" disabled={contactNotes.trim().length<3}
        onClick={()=>mutate(()=>confirmServiceVisitRecoveryContact({
          visitId:visit.id,expectedVersion:visit.version,method,notes:contactNotes,
        }),"Customer contact recorded by staff")}>
        Confirm actual customer contact
      </Button>
    </div>}
    {recovery?.status==="contacted"&&editable&&<div className="mt-3 space-y-2">
      <label className="block text-xs font-medium">Resolution status
        <select aria-label={"Recovery outcome "+visit.id} className={selectClass+" mt-1"}
          value={outcome} onChange={e=>setOutcome(e.target.value as typeof outcome)}>
          <option value="resolved">Customer issue resolved (staff-confirmed)</option>
          <option value="closed_unresolved">Closed — issue unresolved</option>
        </select>
      </label>
      <label className="block text-xs font-medium">What actually happened?
        <textarea aria-label={"Recovery outcome notes "+visit.id}
          className={inputClass+" mt-1"} rows={2} value={outcomeNotes}
          maxLength={1000} onChange={e=>setOutcomeNotes(e.target.value)}/>
      </label>
      <Button size="sm" variant="outline" disabled={outcomeNotes.trim().length<3}
        onClick={()=>mutate(()=>closeServiceVisitRecovery({
          visitId:visit.id,expectedVersion:visit.version,outcome,outcomeNotes,
        }),"Recovery case closure recorded offline")}>Close recovery case</Button>
    </div>}
    {recovery&&["resolved","closed_unresolved"].includes(recovery.status)&&
      <p className="mt-2 text-xs text-slate-500">
        Closed outcomes are immutable. This does not verify customer satisfaction.
      </p>}
  </details>;
}
