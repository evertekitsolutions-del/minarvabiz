"use client";

import * as React from "react";
import {
  can, phase9Store, buildBatchExpiryReport, createBatchExpiryReminder,
  removeBatchExpiryReminder, listBatchExpiryReminders,
  type BatchExpiryReport,
} from "@minarvabiz/business-logic";
import type { Product, Warehouse } from "@minarvabiz/types";
import { Button } from "../Button";
import { inputClass, selectClass } from "../forms/FormField";

function localBusinessDate():string{
  const today=new Date();
  return [today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),
    String(today.getDate()).padStart(2,"0")].join("-");
}

/**
 * Local Windows SQLite snapshot reminder metadata, never authoritative WMS
 * lots or sold-stock blocks. Cloud persistence/sync remain separately gated.
 */
export function WarehouseBatchExpiryPanel({products,warehouses}:{
  products:readonly Product[];warehouses:readonly Warehouse[];
}){
  const [warehouseId,setWarehouseId]=React.useState("");
  const [productId,setProductId]=React.useState("");
  const [batchCode,setBatchCode]=React.useState("");
  const [expiresOn,setExpiresOn]=React.useState("");
  const [notes,setNotes]=React.useState("");
  const [asOf,setAsOf]=React.useState(localBusinessDate);
  const [error,setError]=React.useState<string|null>(null);
  const [message,setMessage]=React.useState<string|null>(null);
  const [report,setReport]=React.useState<BatchExpiryReport|null>(null);
  const [revision,setRevision]=React.useState(0);
  const branchId=phase9Store.getActiveBranch()?.id??null;
  const canEdit=can("inventory.adjust");
  const canRead=can("reports.view");
  const visibleProducts=products.filter(p=>!p.deletedAt&&p.isActive &&
    (p.branchId==null||p.branchId===branchId));
  const visibleWarehouses=warehouses.filter(w=>!w.deletedAt&&w.isActive &&
    (w.branchId==null||w.branchId===branchId));
  function invalidate(){setError(null);setMessage(null);setReport(null);}
  function refresh(){setRevision(v=>v+1);setReport(null);}
  function add(){
    invalidate();
    try{
      createBatchExpiryReminder({productId,warehouseId,batchCode,expiresOn,notes});
      setMessage("Expiry reminder saved to local Windows/offline snapshot");
      setBatchCode("");setExpiresOn("");setNotes("");refresh();
    }catch(e){setError(e instanceof Error?e.message:"Unable to save expiry reminder");}
  }
  function remove(id:string){
    invalidate();
    if(!window.confirm("Remove this expiry reminder? Actual inventory stock is not affected."))return;
    try{
      if(!removeBatchExpiryReminder(id))throw new Error("Expiry reminder not found in the active branch");
      setMessage("Expiry reminder removed; stock and financial records unchanged");
      refresh();
    }catch(e){setError(e instanceof Error?e.message:"Unable to remove reminder");}
  }
  function calculate(){
    invalidate();
    try{setReport(buildBatchExpiryReport(asOf));}
    catch(e){setError(e instanceof Error?e.message:"Unable to build expiry report");}
  }
  function exportCsv(){
    if(!report)return;
    setError(null);
    try{
      const url=URL.createObjectURL(new Blob(["\uFEFF",report.csv],{type:"text/csv;charset=utf-8"}));
      const link=document.createElement("a");link.href=url;
      link.download="minarvabiz-batch-expiry-"+report.asOfDate+".csv";
      document.body.appendChild(link);
      try{link.click();}finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
    }catch(e){setError(e instanceof Error?e.message:"Expiry CSV export failed");}
  }
  if(!canRead)return null;
  void revision;
  const existing=listBatchExpiryReminders();
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-base font-semibold text-slate-900">
        Batch expiry reminders (local register)
      </summary>
      <p className="mt-2 text-xs text-slate-600">
        Keep a durable local list of batch expiry dates and view 30-day alerts.
        Saved in the desktop SQLite domain backup. This is an advisory list,
        NOT live batch stock, automatic FIFO/FEFO, cloud sync, or a stock-sale blocking control.
        Recheck physical quantities before action.
      </p>
      {canEdit&&(
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="text-xs font-medium text-slate-600">Warehouse
              <select aria-label="Expiry warehouse" className={selectClass+" mt-1"}
                value={warehouseId} onChange={e=>{setWarehouseId(e.target.value);invalidate();}}>
                <option value="">Select warehouse</option>
                {visibleWarehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">Product
              <select aria-label="Expiry product" className={selectClass+" mt-1"}
                value={productId} onChange={e=>{setProductId(e.target.value);invalidate();}}>
                <option value="">Select product</option>
                {visibleProducts.map(p=><option key={p.id} value={p.id}>{p.name}{p.sku?" · "+p.sku:""}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">Batch/lot reference
              <input aria-label="Expiry batch code" className={inputClass+" mt-1"}
                value={batchCode} maxLength={64}
                onChange={e=>{setBatchCode(e.target.value);invalidate();}} />
            </label>
            <label className="text-xs font-medium text-slate-600">Expiry date
              <input aria-label="Batch expiry date" className={inputClass+" mt-1"}
                type="date" value={expiresOn}
                onChange={e=>{setExpiresOn(e.target.value);invalidate();}} />
            </label>
            <label className="text-xs font-medium text-slate-600">Notes (optional)
              <input aria-label="Expiry notes" className={inputClass+" mt-1"}
                value={notes} maxLength={500}
                onChange={e=>{setNotes(e.target.value);invalidate();}} />
            </label>
          </div>
          <Button size="sm" variant="outline" onClick={add}>Save expiry reminder</Button>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-600">Report as-of date
          <input aria-label="Expiry report date" type="date" className={inputClass+" mt-1"}
            value={asOf} onChange={e=>{setAsOf(e.target.value);invalidate();}} />
        </label>
        <Button size="sm" variant="outline" onClick={calculate}>Show expiry alerts</Button>
        {report&&<Button size="sm" variant="outline" onClick={exportCsv}>Export expiry CSV</Button>}
        <span className="text-xs text-slate-600">{existing.length} local reminder(s)</span>
      </div>
      {error&&<p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {message&&<p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
      {report&&(
        <div className="mt-4 space-y-3">
          <p role="status" className="text-sm font-semibold">
            {report.expiredCount} expired · {report.expiringSoonCount} expiring in {report.expiringDays} days
          </p>
          <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-[690px] w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr><th className="p-2">Product</th><th className="p-2">Warehouse</th>
                  <th className="p-2">Batch</th><th className="p-2">Expiry</th>
                  <th className="p-2">Days left</th><th className="p-2">Status</th>
                  <th className="p-2">Actions</th></tr>
              </thead>
              <tbody>{report.rows.map(row=>(
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="p-2">{row.productName}</td>
                  <td className="p-2">{row.warehouseName}</td>
                  <td className="p-2">{row.batchCode}</td>
                  <td className="p-2">{row.expiresOn}</td>
                  <td className="p-2">{row.daysRemaining}</td>
                  <td className="p-2">{row.status.replace("_"," ")}</td>
                  <td className="p-2">
                    {canEdit&&<Button variant="outline" size="sm" onClick={()=>remove(row.id)}>Remove reminder</Button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </details>
  );
}
