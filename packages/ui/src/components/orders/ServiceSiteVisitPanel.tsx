"use client";

import * as React from "react";
import type {ServiceOrder, StaffAssignment, Customer} from "@minarvabiz/types";
import {
  can, isProductionMode, listServiceSiteVisits, scheduleServiceSiteVisit,
  markServiceSiteArrival, completeServiceSiteVisit, cancelServiceSiteVisit,
  type ServiceSiteVisit, getShopProfile,
} from "@minarvabiz/business-logic";
import {Button} from "../Button";
import {ServiceSiteVisitChecklist} from "./ServiceSiteVisitChecklist";
import {ServiceSiteVisitNoticeLinks} from "./ServiceSiteVisitNoticeLinks";
import {ServiceSiteVisitEvidencePanel} from "./ServiceSiteVisitEvidencePanel";
import {ServiceVisitSignaturePanel} from "./ServiceVisitSignaturePanel";
import {ServiceVisitSlaPanel} from "./ServiceVisitSlaPanel";
import {ServiceVisitPartsPanel} from "./ServiceVisitPartsPanel";
import {ServiceJobCostPanel} from "./ServiceJobCostPanel";
import {ServiceVisitRoutePanel} from "./ServiceVisitRoutePanel";
import {ServiceVisitFeedbackPanel} from "./ServiceVisitFeedbackPanel";
import {ServiceRecoverySummary,ServiceVisitRecoveryPanel} from "./ServiceVisitRecoveryPanel";
import {ServiceFeedbackInsightsPanel} from "./ServiceFeedbackInsightsPanel";
import {inputClass, selectClass} from "../forms/FormField";

function localDate():string{
  const d=new Date();
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),
    String(d.getDate()).padStart(2,"0")].join("-");
}
/** SVC-005: durable Windows-only field visit events, never automated location tracking. */
export function ServiceSiteVisitPanel({
  orders, assignments,customers=[],
}:{
  orders:readonly ServiceOrder[];
  assignments:readonly StaffAssignment[];
  customers?:readonly Customer[];
}){
  const [isDesktop,setIsDesktop]=React.useState(false);
  React.useEffect(()=>{
    setIsDesktop(Boolean((window as unknown as {minarvaDesktop?:unknown}).minarvaDesktop));
  },[]);
  const [orderId,setOrderId]=React.useState("");
  const [assignmentId,setAssignmentId]=React.useState("");
  const [scheduledOn,setScheduledOn]=React.useState(localDate);
  const [siteAddress,setSiteAddress]=React.useState("");
  const [notes,setNotes]=React.useState("");
  const [arrivalDueLocal,setArrivalDueLocal]=React.useState("");
  const [completionDueLocal,setCompletionDueLocal]=React.useState("");
  const [cancelId,setCancelId]=React.useState<string|null>(null);
  const [cancelReason,setCancelReason]=React.useState("");
  const [revision,setRevision]=React.useState(0);
  const [error,setError]=React.useState<string|null>(null);
  const [message,setMessage]=React.useState<string|null>(null);
  const canRead=can("reports.view");
  const canWrite=can("orders.assign")&&(isDesktop||!isProductionMode());
  const openOrders=orders.filter(o=>!o.deletedAt&&o.branchId&&
    o.status!=="cancelled"&&o.status!=="delivered");
  const availableAssignments=assignments.filter(a=>a.orderId===orderId&&
    (a.status==="assigned"||a.status==="in_progress"));
  void revision;
  if(!canRead)return null;
  let visits:ServiceSiteVisit[]=[];
  let listError:string|null=null;
  try{visits=listServiceSiteVisits();}
  catch(e){listError=e instanceof Error?e.message:"Cannot load site visits";}
  const ordersById=new Map(orders.map(o=>[o.id,o]));
  const shopProfile=getShopProfile();
  const businessName=shopProfile.shopName||"our service team";
  const assignmentNames=new Map(assignments.map(a=>[a.id,a.staffName||a.staffId]));
  const customersById=new Map(customers.filter(c=>!c.deletedAt).map(c=>[c.id,c]));
  function mutate(fn:()=>unknown,success:string){
    setError(null);setMessage(null);
    try{
      fn();setMessage(success);setRevision(r=>r+1);
    }catch(e){
      setError(e instanceof Error?e.message:"Site visit operation failed");
    }
  }
  return <details className="rounded-xl border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer text-sm font-semibold text-slate-900">
      Field service site visits (Windows Offline)
    </summary>
    <p className="mt-2 text-xs text-slate-600">
      Schedule a visit for an assigned technician, record site arrival and work completion,
      or cancel with a reason. Timestamps are manually confirmed; GPS attendance and
      WhatsApp updates require explicit operator sharing; no automated send is performed. Visits are included in offline backup/restore.
    </p>
    {!canWrite&&<p className="mt-2 text-xs text-amber-700">
      Live Web is read-only until authorized cloud persistence is implemented.
    </p>}
    {listError&&<p role="alert" className="mt-2 text-sm text-rose-700">{listError}</p>}
    {canWrite&&<div className="mt-3 space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Schedule technician visit</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs font-medium text-slate-700">
          Service order
          <select aria-label="Site visit service order" value={orderId} className={selectClass+" mt-1"}
            onChange={e=>{setOrderId(e.target.value);setAssignmentId("");}}>
            <option value="">Choose service order</option>
            {openOrders.map(o=><option key={o.id} value={o.id}>
              {o.orderNumber} — {o.customerName||o.customerId}
            </option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700">
          Assigned technician
          <select aria-label="Site visit assigned technician" value={assignmentId}
            className={selectClass+" mt-1"}
            onChange={e=>setAssignmentId(e.target.value)}>
            <option value="">Choose assigned staff</option>
            {availableAssignments.map(a=><option key={a.id} value={a.id}>
              {a.staffName||a.staffId}
            </option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700">
          Planned date
          <input aria-label="Site visit planned date" type="date" value={scheduledOn}
            className={inputClass+" mt-1"} onChange={e=>setScheduledOn(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-slate-700 lg:col-span-2">
          Site address
          <input aria-label="Site visit address" maxLength={500} value={siteAddress}
            className={inputClass+" mt-1"} placeholder="Customer site / floor / landmark"
            onChange={e=>setSiteAddress(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-slate-700 sm:col-span-2 lg:col-span-5">
          Visit checklist / notes
          <input aria-label="Site visit notes" value={notes} maxLength={2000}
            className={inputClass+" mt-1"} onChange={e=>setNotes(e.target.value)}
            placeholder="Inspect wiring, NVR, switch and power" />
        </label>
        <label className="text-xs font-medium text-slate-700 sm:col-span-2">
          Arrival SLA deadline (optional, local time)
          <input aria-label="Visit arrival deadline" type="datetime-local"
            className={inputClass+" mt-1"} value={arrivalDueLocal}
            onChange={e=>setArrivalDueLocal(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-slate-700 sm:col-span-2">
          Completion SLA deadline (optional, local time)
          <input aria-label="Visit completion deadline" type="datetime-local"
            className={inputClass+" mt-1"} value={completionDueLocal}
            onChange={e=>setCompletionDueLocal(e.target.value)} />
        </label>
      </div>
      <p className="text-xs text-slate-500">These optional visit targets are fixed at scheduling.
        Times use this device’s local timezone and are stored as UTC.</p>
      <Button variant="outline" size="sm" disabled={!orderId||!assignmentId||!siteAddress.trim()||
        !scheduledOn} onClick={()=>mutate(()=>{
          const deadline=(value:string):string|null=>value?new Date(value).toISOString():null;
          const arrivalDueAt=deadline(arrivalDueLocal);
          const completionDueAt=deadline(completionDueLocal);
          scheduleServiceSiteVisit({orderId,assignmentId,scheduledOn,siteAddress,notes,
            ...(arrivalDueAt||completionDueAt?{sla:{arrivalDueAt,completionDueAt}}:{})});
          setSiteAddress("");setNotes("");
          setArrivalDueLocal("");setCompletionDueLocal("");
        },"Site visit saved to Windows offline register")}>Schedule site visit</Button>
    </div>}
    <ServiceVisitSlaPanel visits={visits}/>
    <ServiceRecoverySummary visits={visits}/>
    <ServiceFeedbackInsightsPanel visits={visits}/>
    <ServiceVisitRoutePanel visits={visits} canWrite={canWrite} mutate={mutate}/>
    <ServiceJobCostPanel orders={orders} visits={visits}/>
    <div className="mt-4 max-h-96 overflow-auto rounded-lg border border-slate-200">
      <table className="min-w-[780px] w-full text-left text-xs">
        <thead className="bg-slate-50"><tr>
          <th className="p-2">Service order</th><th className="p-2">Technician</th>
          <th className="p-2">Scheduled</th><th className="p-2">Site</th>
          <th className="p-2">Visit state</th><th className="p-2">Action</th>
        </tr></thead>
        <tbody>{visits.map(v=><tr key={v.id} className="border-t border-slate-100">
          <td className="p-2">{ordersById.get(v.orderId)?.orderNumber??v.orderId}</td>
          <td className="p-2">{assignmentNames.get(v.assignmentId)??v.staffId}</td>
          <td className="p-2">{v.scheduledOn}</td>
          <td className="p-2 max-w-48 break-words">{v.siteAddress}
            {v.notes&&<p className="mt-1 text-slate-500">{v.notes}</p>}
          </td>
          <td className="p-2">{v.status}
            {v.arrivedAt&&<p className="text-slate-500">Arrived: {new Date(v.arrivedAt).toLocaleString()}</p>}
            {v.completedAt&&<p className="text-slate-500">Finished: {new Date(v.completedAt).toLocaleString()}</p>}
            {v.cancellationReason&&<p className="text-slate-500">{v.cancellationReason}</p>}
            <ServiceSiteVisitChecklist visit={v} canWrite={canWrite} mutate={mutate}/>
            <ServiceSiteVisitEvidencePanel visit={v} canWrite={canWrite} mutate={mutate}/>
            <ServiceVisitSignaturePanel visit={v} canWrite={canWrite} mutate={mutate}/>
            <ServiceVisitPartsPanel visit={v} canWrite={canWrite} mutate={mutate}/>
            <ServiceVisitRecoveryPanel visit={v} canWrite={canWrite} mutate={mutate}/>
            <ServiceVisitFeedbackPanel visit={v} canWrite={canWrite} mutate={mutate}
              customerPhone={(()=>{
                const c=customersById.get(v.customerId);
                return c&&(c.branchId==null||c.branchId===v.branchId)
                  ?(c.whatsapp||c.phone):null;
              })()}/>
          </td>
          <td className="p-2">
            <ServiceSiteVisitNoticeLinks visit={v} customer={customersById.get(v.customerId)}
              orderNumber={ordersById.get(v.orderId)?.orderNumber??v.orderId}
              businessName={businessName} technicianName={assignmentNames.get(v.assignmentId)??v.staffId}
              googleReviewUrl={shopProfile.googleReviewUrl??""} canShare={canWrite} />
            {canWrite&&v.status==="scheduled"&&<>
              <Button size="sm" variant="outline" onClick={()=>mutate(
                ()=>markServiceSiteArrival(v.id,v.version),"Site arrival recorded")}>Mark arrived</Button>
              <Button size="sm" variant="outline" onClick={()=>{
                setCancelId(v.id);setCancelReason("");
              }}>Cancel visit</Button>
            </>}
            {canWrite&&v.status==="arrived"&&
              <Button size="sm" variant="outline" onClick={()=>mutate(
                ()=>completeServiceSiteVisit(v.id,v.version),"Visit completed")}>Finish visit</Button>}
            {canWrite&&cancelId===v.id&&v.status==="scheduled"&&
              <div className="mt-2 space-y-1">
                <input aria-label="Site visit cancellation reason" value={cancelReason}
                  maxLength={500} className={inputClass} onChange={e=>setCancelReason(e.target.value)}
                  placeholder="Reason for cancellation" />
                <Button size="sm" variant="outline" disabled={cancelReason.trim().length<3}
                  onClick={()=>mutate(()=>{
                    cancelServiceSiteVisit(v.id,v.version,cancelReason);
                    setCancelId(null);
                  },"Visit cancelled with reason")}>Confirm cancellation</Button>
                <Button size="sm" variant="outline" onClick={()=>setCancelId(null)}>Keep visit</Button>
              </div>}
          </td>
        </tr>)}</tbody>
      </table>
      {visits.length===0&&<p className="p-3 text-xs text-slate-500">No site visits recorded for this branch.</p>}
    </div>
    {error&&<p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    {message&&<p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
  </details>;
}
