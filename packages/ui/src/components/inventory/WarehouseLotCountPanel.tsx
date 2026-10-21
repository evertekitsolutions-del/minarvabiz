"use client";

import * as React from "react";
import {
  can, isProductionMode, warehouseStore,
  listBatchExpiryReminders, listLocalLotCounts,
  saveLocalLotCount, deleteLocalLotCount, planLocalLotFefo,
  type LocalLotCount, type LocalLotFefoWorksheet,
} from "@minarvabiz/business-logic";
import type { Warehouse, Product } from "@minarvabiz/types";
import { Button } from "../Button";
import { inputClass, selectClass } from "../forms/FormField";

function todayLocal():string{
  const d=new Date();
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
}

/** Standalone on-device stocktake + advisory FEFO. No sale/stock posting. */
export function WarehouseLotCountPanel({products,warehouses}:{
  products:readonly Product[];warehouses:readonly Warehouse[];
}){
  const [localWritable,setLocalWritable]=React.useState(false);
  React.useEffect(()=>{
    const desktop=Boolean((window as unknown as {minarvaDesktop?:unknown}).minarvaDesktop);
    setLocalWritable(desktop||!isProductionMode());
  },[]);
  const [reminderId,setReminderId]=React.useState("");
  const [locationId,setLocationId]=React.useState("");
  const [quantity,setQuantity]=React.useState("");
  const [blocked,setBlocked]=React.useState(false);
  const [editing,setEditing]=React.useState<LocalLotCount|null>(null);
  const [pickWarehouse,setPickWarehouse]=React.useState("");
  const [pickProduct,setPickProduct]=React.useState("");
  const [pickQuantity,setPickQuantity]=React.useState("");
  const [pickDate,setPickDate]=React.useState(todayLocal);
  const [worksheet,setWorksheet]=React.useState<LocalLotFefoWorksheet|null>(null);
  const [error,setError]=React.useState<string|null>(null);
  const [message,setMessage]=React.useState<string|null>(null);
  const [revision,setRevision]=React.useState(0);
  const read=can("reports.view");
  const edit=can("inventory.adjust")&&localWritable;
  if(!read)return null;
  void revision;
  const reminders=listBatchExpiryReminders();
  const counts=listLocalLotCounts();
  const wmsLocations=warehouseStore.listWarehouseLocations();
  const selected=reminders.find(r=>r.id===reminderId);
  const locations=wmsLocations.filter(l=>l.warehouseId===selected?.warehouseId);
  const productName=(id:string)=>products.find(p=>p.id===id)?.name??id;
  const warehouseName=(id:string)=>warehouses.find(w=>w.id===id)?.name??id;
  const locationName=(id:string)=>wmsLocations.find(l=>l.id===id)?.code??id;
  const reminderName=(id:string)=>{
    const r=reminders.find(row=>row.id===id);
    return r?`${productName(r.productId)} / ${r.batchCode} / ${r.expiresOn}`:id;
  };
  function resetForm(){
    setReminderId("");setLocationId("");setQuantity("");setBlocked(false);setEditing(null);
  }
  function save(){
    setError(null);setMessage(null);
    try{
      saveLocalLotCount({reminderId,locationId,quantity,status:blocked?"blocked":"active",
        ...(editing?{id:editing.id,expectedVersion:editing.version}:{})});
      resetForm();setMessage("Batch physical count recorded locally; live stock unchanged");
      setWorksheet(null);setRevision(v=>v+1);
    }catch(e){setError(e instanceof Error?e.message:"Unable to save counted lot");}
  }
  function del(row:LocalLotCount){
    if(!window.confirm("Delete this local lot count? No physical stock or journal will change."))return;
    setError(null);setMessage(null);
    try{
      if(!deleteLocalLotCount(row.id,row.version))throw new Error("Lot count no longer exists");
      if(editing?.id===row.id)resetForm();
      setWorksheet(null);setRevision(v=>v+1);setMessage("Local lot count deleted");
    }catch(e){setError(e instanceof Error?e.message:"Unable to delete lot count");}
  }
  function pick(){
    setError(null);setMessage(null);setWorksheet(null);
    try{setWorksheet(planLocalLotFefo({
      warehouseId:pickWarehouse,productId:pickProduct,quantity:pickQuantity,asOfDate:pickDate,
    }));}
    catch(e){setError(e instanceof Error?e.message:"FEFO planning failed");}
  }
  const positionCounts=new Map<string,number>();
  for(const row of counts){
    const k=JSON.stringify([row.productId,row.locationId]);
    positionCounts.set(k,(positionCounts.get(k)??0)+row.quantityMilli);
  }
  const stale=counts.some(row=>{
    const r=reminders.find(x=>x.id===row.reminderId);
    if(!r)return true;
    const physical=warehouseStore.listWarehouseStock({locationId:row.locationId,productId:row.productId})
      .find(p=>p.warehouseId===row.warehouseId);
    return !physical||(positionCounts.get(JSON.stringify([row.productId,row.locationId]))??0) >
      Math.round(physical.onHand*1000);
  });
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-base font-semibold text-slate-900">
        Batch physical counts & FEFO worksheet (Windows Offline)
      </summary>
      <p className="mt-2 text-xs text-slate-600">
        Record the counted units for an existing batch reminder in a WMS bin. Local snapshots
        retain counts, blocked status and revisions. FEFO suggests a pick by nearest valid
        expiry date. This does not reserve or debit stock, block checkout, or sync to cloud.
        Recheck against live WMS before using any pick.
      </p>
      {!localWritable&&<p className="mt-2 text-xs text-amber-700">
        Editing requires installed Windows SQLite. Production Web is read-only.
      </p>}
      {stale&&<p role="alert" className="mt-2 text-xs text-rose-700">
        One or more recorded counts exceed current WMS allocation or have a missing batch.
        Recount before using FEFO.
      </p>}
      {edit&&(
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-medium text-slate-600">Expiry batch
            <select aria-label="Lot count expiry batch" className={selectClass+" mt-1"}
              value={reminderId}
              onChange={e=>{setReminderId(e.target.value);setLocationId("");setError(null);}}>
              <option value="">Select recorded batch</option>
              {reminders.map(r=><option key={r.id} value={r.id}>{reminderName(r.id)}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">WMS location
            <select aria-label="Lot count location" className={selectClass+" mt-1"} value={locationId}
              onChange={e=>setLocationId(e.target.value)}>
              <option value="">Select allocated bin</option>
              {locations.map(l=><option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">Counted units (max 3 decimals)
            <input aria-label="Lot count units" className={inputClass+" mt-1"}
              value={quantity} inputMode="decimal" placeholder="2.500"
              onChange={e=>setQuantity(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input type="checkbox" checked={blocked} onChange={e=>setBlocked(e.target.checked)} />
            Block from FEFO worksheet
          </label>
          <div className="flex items-end gap-2">
            <Button size="sm" variant="outline" onClick={save}>{editing?"Update count":"Save physical count"}</Button>
            {editing&&<Button size="sm" variant="outline" onClick={resetForm}>Cancel</Button>}
          </div>
        </div>
      )}
      <div className="mt-4 overflow-auto rounded-lg border border-slate-200">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr><th className="p-2">Batch / product</th><th className="p-2">Warehouse/bin</th>
              <th className="p-2">Counted qty</th><th className="p-2">Status</th>
              <th className="p-2">Revision</th><th className="p-2">Action</th></tr>
          </thead>
          <tbody>{counts.map(row=>(
            <tr key={row.id} className="border-t border-slate-100">
              <td className="p-2">{reminderName(row.reminderId)}</td>
              <td className="p-2">{warehouseName(row.warehouseId)} / {locationName(row.locationId)}</td>
              <td className="p-2">{row.quantityMilli/1000}</td>
              <td className="p-2">{row.status}</td>
              <td className="p-2">{row.version}</td>
              <td className="p-2">{edit&&<div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={()=>{
                  setEditing(row);setReminderId(row.reminderId);setLocationId(row.locationId);
                  setQuantity(String(row.quantityMilli/1000));setBlocked(row.status==="blocked");
                }}>Edit</Button>
                <Button size="sm" variant="outline" onClick={()=>del(row)}>Remove</Button>
              </div>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="mt-4 space-y-3">
        <p className="text-sm font-semibold">FEFO pick worksheet (advisory only)</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-medium text-slate-600">Warehouse
            <select aria-label="FEFO warehouse" className={selectClass+" mt-1"}
              value={pickWarehouse} onChange={e=>{setPickWarehouse(e.target.value);setWorksheet(null);}}>
              <option value="">Select warehouse</option>
              {warehouses.filter(w=>w.isActive&&!w.deletedAt).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">Product
            <select aria-label="FEFO product" className={selectClass+" mt-1"}
              value={pickProduct} onChange={e=>{setPickProduct(e.target.value);setWorksheet(null);}}>
              <option value="">Select product</option>
              {products.filter(p=>p.isActive&&!p.deletedAt).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">Quantity
            <input aria-label="FEFO pick quantity" className={inputClass+" mt-1"} value={pickQuantity}
              onChange={e=>{setPickQuantity(e.target.value);setWorksheet(null);}} inputMode="decimal" placeholder="3"/>
          </label>
          <label className="text-xs font-medium text-slate-600">Business date
            <input aria-label="FEFO date" className={inputClass+" mt-1"} type="date"
              value={pickDate} onChange={e=>{setPickDate(e.target.value);setWorksheet(null);}} />
          </label>
          <div className="flex items-end">
            <Button size="sm" variant="outline" onClick={pick}>Plan FEFO pick</Button>
          </div>
        </div>
        {worksheet&&<div role="status" className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold">Pick suggestion only — no stock mutation.</p>
          {worksheet.allocations.map(p=><p key={p.countId} className="text-sm">
            {p.batchCode} · {locationName(p.locationId)} · expiry {p.expiresOn}: {p.quantityMilli/1000} units
          </p>)}
        </div>}
      </div>
      {error&&<p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {message&&<p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
    </details>
  );
}
