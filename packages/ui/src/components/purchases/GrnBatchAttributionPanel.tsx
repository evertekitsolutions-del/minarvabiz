"use client";

import * as React from "react";
import type { GoodsReceipt, Product } from "@minarvabiz/types";
import {
  can, phase9Store, isProductionMode,
  listGrnBatchAttributions, grnBatchCoverage,
  recordGrnBatchAttribution, voidGrnBatchAttribution,
  type GrnBatchAttribution,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { inputClass, selectClass } from "../forms/FormField";

/** Already-posted physical GRN → immutable local batch trace. No second stock posting. */
export function GrnBatchAttributionPanel({receipts,products}:{
  receipts: readonly GoodsReceipt[];
  products: readonly Product[];
}) {
  const [desktopEditable,setDesktopEditable]=React.useState(false);
  React.useEffect(()=>{
    const desktop=Boolean((window as unknown as {minarvaDesktop?:unknown}).minarvaDesktop);
    setDesktopEditable(desktop||!isProductionMode());
  },[]);
  const [receiptId,setReceiptId]=React.useState("");
  const [lineId,setLineId]=React.useState("");
  const [batchCode,setBatchCode]=React.useState("");
  const [expiry,setExpiry]=React.useState("");
  const [quantity,setQuantity]=React.useState("");
  const [voidTarget,setVoidTarget]=React.useState<GrnBatchAttribution|null>(null);
  const [voidReason,setVoidReason]=React.useState("");
  const [error,setError]=React.useState<string|null>(null);
  const [message,setMessage]=React.useState<string|null>(null);
  const [revision,setRevision]=React.useState(0);
  const branchId=phase9Store.getActiveBranch()?.id;
  const visible=receipts.filter(g=>g.branchId==null||g.branchId===branchId);
  const receipt=visible.find(x=>x.id===receiptId);
  const tracked=receipt?.lines.filter(l=>l.productId&&l.receivedQuantity>0)??[];
  const canRead=can("reports.view"),canEdit=can("purchases.manage")&&desktopEditable;
  if(!canRead)return null;
  void revision;
  function clear(){setError(null);setMessage(null);}
  const entries=listGrnBatchAttributions(receiptId||undefined);
  const coverage=receiptId?grnBatchCoverage(receiptId):[];
  const coverageLine=coverage.find(l=>l.goodsReceiptLineId===lineId);
  const name=(id:string)=>products.find(p=>p.id===id)?.name??id;
  function save() {
    clear();
    try{
      recordGrnBatchAttribution({
        goodsReceiptId:receiptId,goodsReceiptLineId:lineId,
        batchCode,expiryDate:expiry,quantity,
      });
      setMessage("Batch attribution saved in local SQLite backup. Posted GRN stock unchanged.");
      setBatchCode("");setExpiry("");setQuantity("");setRevision(x=>x+1);
    }catch(e){setError(e instanceof Error?e.message:"Unable to record GRN batch");}
  }
  function voidEntry() {
    if(!voidTarget)return;
    clear();
    try{
      voidGrnBatchAttribution(voidTarget.id,voidTarget.version,voidReason);
      setMessage("Attribution voided with audit history; original GRN stock unchanged");
      setVoidTarget(null);setVoidReason("");setRevision(x=>x+1);
    }catch(e){setError(e instanceof Error?e.message:"Unable to void batch attribution");}
  }
  return <details className="rounded-xl border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer text-base font-semibold text-slate-900">
      GRN batch and expiry trace register (Windows Offline)
    </summary>
    <p className="mt-2 text-xs text-slate-600">
      Assign lot numbers, expiry dates and partial quantities to a posted Goods Receipt.
      Totals cannot exceed the received line. This is recorded provenance only:
      no additional stock credit, sale prevention, warehouse reconciliation or cloud synchronization.
    </p>
    {!desktopEditable&&<p className="mt-2 text-xs text-amber-700">
      Production Web is read-only; saving requires the installed Windows SQLite edition.
    </p>}
    <div className="mt-3 flex flex-wrap gap-3">
      <label className="min-w-52 flex-1 text-xs font-medium text-slate-600">Posted Goods Receipt
        <select aria-label="Select GRN for batch trace" className={selectClass+" mt-1"}
          value={receiptId} onChange={e=>{setReceiptId(e.target.value);setLineId("");clear();}}>
          <option value="">Select Goods Receipt</option>
          {visible.map(g=><option value={g.id} key={g.id}>
            {g.grnNumber} · {g.poNumber} · {g.receiptDate}
          </option>)}
        </select>
      </label>
      <label className="min-w-52 flex-1 text-xs font-medium text-slate-600">Received product line
        <select aria-label="Select GRN product line" className={selectClass+" mt-1"}
          value={lineId} onChange={e=>{setLineId(e.target.value);clear();}}>
          <option value="">Select received line</option>
          {tracked.map(l=><option key={l.id} value={l.id}>
            {l.description} · {l.receivedQuantity} received
          </option>)}
        </select>
      </label>
    </div>
    {coverageLine&&<p className="mt-2 text-sm text-slate-600">
      Total received: {coverageLine.receivedMilli/1000} · Recorded: {coverageLine.attributedMilli/1000} ·
      Not yet assigned to batches: {coverageLine.unattributedMilli/1000}
    </p>}
    {canEdit&&receipt&&lineId&&<div className="mt-3 grid gap-3 sm:grid-cols-4">
      <label className="text-xs font-medium text-slate-600">Batch or lot number
        <input aria-label="GRN batch number" className={inputClass+" mt-1"} maxLength={64}
          value={batchCode} onChange={e=>setBatchCode(e.target.value)}/>
      </label>
      <label className="text-xs font-medium text-slate-600">Expiry date
        <input aria-label="GRN batch expiry date" className={inputClass+" mt-1"} type="date"
          value={expiry} onChange={e=>setExpiry(e.target.value)}/>
      </label>
      <label className="text-xs font-medium text-slate-600">Batch received quantity
        <input aria-label="GRN batch received units" className={inputClass+" mt-1"}
          inputMode="decimal" value={quantity} placeholder="1.250"
          onChange={e=>setQuantity(e.target.value)}/>
      </label>
      <div className="flex items-end"><Button size="sm" variant="outline" onClick={save}>
        Record GRN batch
      </Button></div>
    </div>}
    {receipt&&<div className="mt-4 overflow-x-auto">
      <table className="min-w-[650px] w-full text-left text-sm">
        <thead><tr className="border-b border-slate-200">
          <th className="p-2">Received product</th><th className="p-2">Batch</th>
          <th className="p-2">Expiry</th><th className="p-2">Quantity</th>
          <th className="p-2">Status</th><th className="p-2">Action</th></tr></thead>
        <tbody>{entries.map(e=><tr key={e.id} className="border-b border-slate-100">
          <td className="p-2">{name(e.productId)}</td>
          <td className="p-2">{e.batchCode}</td>
          <td className="p-2">{e.expiryDate}</td>
          <td className="p-2">{e.quantityMilli/1000}</td>
          <td className="p-2">{e.voidedAt?"Voided · "+e.voidReason:"Recorded"}</td>
          <td className="p-2">{canEdit&&!e.voidedAt&&<Button size="sm" variant="outline"
            onClick={()=>{setVoidTarget(e);setVoidReason("");clear();}}>Void</Button>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {voidTarget&&canEdit&&<div className="mt-3 rounded-lg border border-slate-200 p-3">
      <label className="text-xs font-medium text-slate-600">
        Reason for voiding batch {voidTarget.batchCode} (required)
        <input aria-label="GRN batch void reason" className={inputClass+" mt-1"}
          value={voidReason} maxLength={250} onChange={e=>setVoidReason(e.target.value)}/>
      </label>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" onClick={voidEntry}>Confirm void</Button>
        <Button size="sm" variant="outline" onClick={()=>{setVoidTarget(null);setVoidReason("");}}>Cancel</Button>
      </div>
    </div>}
    {error&&<p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    {message&&<p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
  </details>;
}
