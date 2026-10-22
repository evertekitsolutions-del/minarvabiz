"use client";

import * as React from "react";
import {
  can, isProductionMode, listServiceWarranties, registerServiceWarranty,
  openServiceWarrantyClaim, closeServiceWarrantyClaim,
  type ServiceWarrantyClaim,
} from "@minarvabiz/business-logic";
import type { ServiceOrder } from "@minarvabiz/types";
import { Button } from "../Button";
import { inputClass, selectClass } from "../forms/FormField";

function todayLocal():string {
  const d=new Date();
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),
    String(d.getDate()).padStart(2,"0")].join("-");
}
export function ServiceWarrantyPanel({orders}:{orders:readonly ServiceOrder[]}) {
  const [localWritable,setLocalWritable]=React.useState(false);
  React.useEffect(()=>{
    setLocalWritable(Boolean((window as unknown as {minarvaDesktop?:unknown}).minarvaDesktop) ||
      !isProductionMode());
  },[]);
  const [orderId,setOrderId]=React.useState("");
  const [assetReference,setAssetReference]=React.useState("");
  const [startsOn,setStartsOn]=React.useState(todayLocal);
  const [endsOn,setEndsOn]=React.useState("");
  const [coverageTerms,setCoverageTerms]=React.useState("");
  const [claimWarrantyId,setClaimWarrantyId]=React.useState("");
  const [reportedOn,setReportedOn]=React.useState(todayLocal);
  const [issue,setIssue]=React.useState("");
  const [resolveNotes,setResolveNotes]=React.useState("");
  const [editingClaim,setEditingClaim]=React.useState<ServiceWarrantyClaim|null>(null);
  const [feedback,setFeedback]=React.useState<string|null>(null);
  const [error,setError]=React.useState<string|null>(null);
  const [revision,setRevision]=React.useState(0);
  const read=can("reports.view");
  const edit=can("orders.manage")&&localWritable;
  const delivered=orders.filter(o=>o.status==="delivered"&&!o.deletedAt);
  if(!read)return null;
  void revision;
  const data=listServiceWarranties();
  const warrantyNames=new Map(data.warranties.map(w=>[w.id,w.assetReference]));
  const sourceNames=new Map(orders.map(o=>[o.id,o.orderNumber]));
  function mutate(fn:()=>void,success:string){
    setFeedback(null);setError(null);
    try{fn();setFeedback(success);setRevision(r=>r+1);}
    catch(e){setError(e instanceof Error?e.message:"Warranty operation failed");}
  }
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-900">
        Service warranties and claim tracking (Windows Offline)
      </summary>
      <p className="mt-2 text-xs text-slate-600">
        Register service workmanship coverage after delivery, track claim issues and record
        resolutions in the Windows SQLite domain backup. This is shop-recorded coverage,
        not a manufacturer/insurance approval, refund or replacement authorization.
        Cloud sync is not available.
      </p>
      {!localWritable&&<p className="mt-2 text-xs text-amber-700">
        Production Web is read-only. Editing requires installed Windows SQLite.
      </p>}
      {edit&&<div className="mt-3 space-y-3">
        <p className="text-sm font-semibold">Register warranty for delivered service</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-medium text-slate-600">Delivered order
            <select aria-label="Warranty service order" className={selectClass+" mt-1"}
              value={orderId} onChange={e=>setOrderId(e.target.value)}>
              <option value="">Choose delivered order</option>
              {delivered.map(o=><option key={o.id} value={o.id}>
                {o.orderNumber} · {o.customerName??o.customerId}
              </option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">Asset / reference
            <input aria-label="Warranty asset reference" className={inputClass+" mt-1"}
              maxLength={100} value={assetReference} placeholder="NVR-Serial-123"
              onChange={e=>setAssetReference(e.target.value)}/>
          </label>
          <label className="text-xs font-medium text-slate-600">Coverage starts
            <input aria-label="Warranty start date" type="date" className={inputClass+" mt-1"}
              value={startsOn} onChange={e=>setStartsOn(e.target.value)}/>
          </label>
          <label className="text-xs font-medium text-slate-600">Coverage ends (inclusive)
            <input aria-label="Warranty end date" type="date" className={inputClass+" mt-1"}
              value={endsOn} onChange={e=>setEndsOn(e.target.value)}/>
          </label>
          <label className="text-xs font-medium text-slate-600">Workmanship terms
            <input aria-label="Warranty coverage terms" className={inputClass+" mt-1"} maxLength={500}
              value={coverageTerms} onChange={e=>setCoverageTerms(e.target.value)}/>
          </label>
        </div>
        <Button variant="outline" size="sm" onClick={()=>mutate(()=>{
          registerServiceWarranty({orderId,assetReference,startsOn,endsOn,coverageTerms});
          setAssetReference("");setEndsOn("");setCoverageTerms("");
        },"Service warranty saved to local record")}>Save service warranty</Button>
      </div>}
      <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-slate-200">
        <table className="min-w-[650px] w-full text-left text-xs">
          <thead className="bg-slate-50"><tr>
            <th className="p-2">Service order</th><th className="p-2">Asset</th>
            <th className="p-2">From</th><th className="p-2">Through</th>
            <th className="p-2">Terms</th>
          </tr></thead>
          <tbody>{data.warranties.map(w=><tr key={w.id} className="border-t border-slate-100">
            <td className="p-2">{sourceNames.get(w.orderId)??w.orderId}</td>
            <td className="p-2">{w.assetReference}</td>
            <td className="p-2">{w.startsOn}</td>
            <td className="p-2">{w.endsOn}</td>
            <td className="p-2">{w.coverageTerms||"—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {edit&&<div className="mt-4 space-y-3">
        <p className="text-sm font-semibold">Open a claim within coverage dates</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-medium text-slate-600">Warranty
            <select aria-label="Warranty claim coverage" className={selectClass+" mt-1"}
              value={claimWarrantyId} onChange={e=>setClaimWarrantyId(e.target.value)}>
              <option value="">Select warranty</option>
              {data.warranties.map(w=><option key={w.id} value={w.id}>
                {w.assetReference} · {sourceNames.get(w.orderId)??w.orderId}
              </option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">Reported date
            <input aria-label="Warranty reported date" type="date" className={inputClass+" mt-1"}
              value={reportedOn} onChange={e=>setReportedOn(e.target.value)}/>
          </label>
          <label className="text-xs font-medium text-slate-600 lg:col-span-2">Reported issue
            <input aria-label="Warranty issue" className={inputClass+" mt-1"} maxLength={500}
              value={issue} onChange={e=>setIssue(e.target.value)} />
          </label>
        </div>
        <Button size="sm" variant="outline" onClick={()=>mutate(()=>{
          openServiceWarrantyClaim({warrantyId:claimWarrantyId,reportedOn,issue});
          setIssue("");
        },"Warranty claim recorded")}>Open warranty claim</Button>
      </div>}
      <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-slate-200">
        <table className="min-w-[630px] w-full text-left text-xs">
          <thead className="bg-slate-50"><tr>
            <th className="p-2">Asset</th><th className="p-2">Reported</th>
            <th className="p-2">Issue</th><th className="p-2">Status</th>
            <th className="p-2">Resolution</th><th className="p-2">Action</th>
          </tr></thead>
          <tbody>{data.claims.map(c=><tr key={c.id} className="border-t border-slate-100">
            <td className="p-2">{warrantyNames.get(c.warrantyId)??c.warrantyId}</td>
            <td className="p-2">{c.reportedOn}</td>
            <td className="p-2">{c.issue}</td>
            <td className="p-2">{c.status}</td>
            <td className="p-2">{c.resolutionNotes||"—"}</td>
            <td className="p-2">{edit&&c.status==="open"&&
              <Button variant="outline" size="sm" onClick={()=>{
                setEditingClaim(c);setResolveNotes("");setError(null);
              }}>Resolve</Button>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {edit&&editingClaim&&<div className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3">
        <p className="text-sm font-medium">Close claim: {editingClaim.issue}</p>
        <label className="block text-xs font-medium text-slate-600">Resolution / rejection reason
          <textarea aria-label="Warranty claim resolution reason" className={inputClass+" mt-1"}
            maxLength={500} value={resolveNotes} onChange={e=>setResolveNotes(e.target.value)}/>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={()=>mutate(()=>{
            closeServiceWarrantyClaim({claimId:editingClaim.id,expectedVersion:editingClaim.version,
              status:"resolved",resolutionNotes:resolveNotes});setEditingClaim(null);
          },"Warranty claim resolved")}>Mark resolved</Button>
          <Button size="sm" variant="outline" onClick={()=>mutate(()=>{
            closeServiceWarrantyClaim({claimId:editingClaim.id,expectedVersion:editingClaim.version,
              status:"rejected",resolutionNotes:resolveNotes});setEditingClaim(null);
          },"Warranty claim rejected")}>Reject claim</Button>
          <Button size="sm" variant="outline" onClick={()=>setEditingClaim(null)}>Cancel</Button>
        </div>
      </div>}
      {error&&<p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {feedback&&<p role="status" className="mt-3 text-sm text-emerald-700">{feedback}</p>}
    </details>
  );
}
