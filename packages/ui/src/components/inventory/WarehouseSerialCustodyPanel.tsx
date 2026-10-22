"use client";

import * as React from "react";
import {
  can, isProductionMode, phase9Store, warehouseStore, store,
  createSerialCustodyRecord, updateSerialCustodyRecord,
  buildSerialCustodyReport, verifySerialInvoiceProductMatch,
  type SerialInvoiceCheck, type SerialCustodyStatus, type SerialCustodyRecord,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { inputClass, selectClass } from "../forms/FormField";

/**
 * Physical scanner/manual serial custody register for the Windows SQLite
 * snapshot. This is NOT a posted sales/GRN serial allocation or cloud feed.
 */
export function WarehouseSerialCustodyPanel() {
  const [localWritable,setLocalWritable]=React.useState(false);
  React.useEffect(()=>{
    const desktop=Boolean((window as unknown as {minarvaDesktop?:unknown}).minarvaDesktop);
    setLocalWritable(desktop || !isProductionMode());
  },[]);
  const [warehouseId,setWarehouseId]=React.useState("");
  const [locationId,setLocationId]=React.useState("");
  const [productId,setProductId]=React.useState("");
  const [serial,setSerial]=React.useState("");
  const [notes,setNotes]=React.useState("");
  const [search,setSearch]=React.useState("");
  const [edited,setEdited]=React.useState<SerialCustodyRecord|null>(null);
  const [status,setStatus]=React.useState<SerialCustodyStatus>("in_stock");
  const [reference,setReference]=React.useState("");
  const [message,setMessage]=React.useState<string|null>(null);
  const [error,setError]=React.useState<string|null>(null);
  const [revision,setRevision]=React.useState(0);
  const [invoiceCheck,setInvoiceCheck]=React.useState<SerialInvoiceCheck|null>(null);
  const canRead=can("reports.view");
  const canEdit=can("inventory.adjust")&&localWritable;
  const branchId=phase9Store.getActiveBranch()?.id;
  if(!canRead)return null;
  void revision;
  const warehouses=warehouseStore.listWarehouses().filter(w=>w.branchId==null||w.branchId===branchId);
  const locations=warehouseStore.listWarehouseLocations(warehouseId).filter(l=>l.isActive&&!l.deletedAt);
  const products=store.listProducts().filter(p=>p.isActive&&!p.deletedAt &&
    (p.branchId==null||p.branchId===branchId));
  let report:ReturnType<typeof buildSerialCustodyReport>|null=null;
  try{report=buildSerialCustodyReport(search);}catch{report=null;}
  function refresh(text:string){
    setMessage(text);setError(null);setInvoiceCheck(null);setRevision(n=>n+1);
  }
  function create(){
    setMessage(null);setError(null);
    try{
      createSerialCustodyRecord({warehouseId,locationId,productId,serialNumber:serial,notes});
      setSerial("");setNotes("");
      refresh("Serial registered in the local Windows backup/snapshot");
    }catch(e){setError(e instanceof Error?e.message:"Serial registration failed");}
  }
  function update(){
    if(!edited)return;
    setMessage(null);setError(null);
    try{
      updateSerialCustodyRecord({id:edited.id,expectedVersion:edited.version,
        status,reference,notes});
      setEdited(null);setReference("");setNotes("");setStatus("in_stock");
      refresh("Serial custody updated; live stock and invoices unchanged");
    }catch(e){setError(e instanceof Error?e.message:"Custody update failed");}
  }
  function checkInvoice(id:string){
    setInvoiceCheck(null);setError(null);
    try{setInvoiceCheck(verifySerialInvoiceProductMatch(id));}
    catch(e){setError(e instanceof Error?e.message:"Invoice reference check failed");}
  }
  function downloadCsv(){
    if(!report)return;
    const object=URL.createObjectURL(new Blob(["\uFEFF",report.csv],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a");
    a.href=object;a.download="minarvabiz-serial-custody.csv";
    document.body.appendChild(a);
    try{a.click();}finally{a.remove();window.setTimeout(()=>URL.revokeObjectURL(object),1000);}
  }
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-base font-semibold text-slate-900">
        Product serial / IMEI custody (Windows Offline)
      </summary>
      <p className="mt-2 text-xs text-slate-600">
        Record one manufacturer serial or IMEI per physical product for CCTV, computers,
        warranty identification and service lookup. Case-insensitive duplicates are blocked.
        Changes are saved to the Windows SQLite snapshot and backup.
        Sale references and status are <strong>manual custody notes</strong>, not verified invoices,
        automatic stock debits, cloud sync or warranty authorization.
      </p>
      {!localWritable&&<p className="mt-2 text-xs text-amber-700">
        Production Web is read-only: use installed Windows SQLite until secure hosted persistence is available.
      </p>}
      {canEdit&&<div className="mt-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-medium text-slate-600">
            Warehouse
            <select aria-label="Serial warehouse" value={warehouseId} className={selectClass+" mt-1"}
              onChange={e=>{setWarehouseId(e.target.value);setLocationId("");}}>
              <option value="">Select warehouse</option>
              {warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Warehouse bin
            <select aria-label="Serial bin" value={locationId} className={selectClass+" mt-1"}
              onChange={e=>setLocationId(e.target.value)}>
              <option value="">Select bin</option>
              {locations.map(l=><option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Product / SKU
            <select aria-label="Serial product" value={productId} className={selectClass+" mt-1"}
              onChange={e=>setProductId(e.target.value)}>
              <option value="">Select product</option>
              {products.map(p=><option key={p.id} value={p.id}>{p.name}{p.sku?" · "+p.sku:""}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Serial / IMEI (manual scan or type)
            <input aria-label="Serial or IMEI" value={serial} className={inputClass+" mt-1"}
              maxLength={100} autoComplete="off" onChange={e=>setSerial(e.target.value)}/>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Optional notes
            <input aria-label="Serial notes" value={notes} className={inputClass+" mt-1"}
              maxLength={500} onChange={e=>setNotes(e.target.value)} />
          </label>
        </div>
        {!edited&&<Button size="sm" variant="outline" onClick={create}>Register serial / IMEI</Button>}
        {edited&&<div className="rounded-lg border border-slate-200 p-3 space-y-2">
          <p className="text-sm font-semibold">Edit custody: {edited.serialNumber} · revision {edited.version}</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-slate-600">
              Manual custody status
              <select aria-label="Serial custody status" value={status}
                className={selectClass+" mt-1"}
                onChange={e=>setStatus(e.target.value as SerialCustodyStatus)}>
                <option value="in_stock">In stock</option>
                <option value="sold">Marked sold (manual)</option>
                <option value="service">At service / repair</option>
                <option value="retired">Retired / scrapped</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              Manual invoice/service reference (required when marked sold)
              <input aria-label="Serial reference" value={reference} maxLength={120}
                className={inputClass+" mt-1"}
                onChange={e=>setReference(e.target.value)}/>
            </label>
            <Button variant="outline" size="sm" onClick={update}>Save custody status</Button>
            <Button variant="outline" size="sm" onClick={()=>{
              setEdited(null);setStatus("in_stock");setReference("");setNotes("");
            }}>Cancel</Button>
          </div>
          <p className="text-xs text-slate-500">Manual status does not reserve/release/sell stock, issue invoices or modify tax/GL.</p>
        </div>}
      </div>}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-600">
          Search serial or manual reference
          <input aria-label="Find serial" value={search} maxLength={100}
            className={inputClass+" mt-1"} onChange={e=>setSearch(e.target.value)}/>
        </label>
        {report&&<Button variant="outline" size="sm" onClick={downloadCsv}>Export serial CSV</Button>}
      </div>
      {error&&<p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {message&&<p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
      {report&&<div className="mt-4 space-y-3">
        <p className="text-xs text-slate-600">
          {report.total} serials · {report.onHand} in stock · {report.sold} manually sold ·
          {" "}{report.service} service · {report.retired} retired
        </p>
        <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr><th className="p-2">Serial</th><th className="p-2">Product</th>
                <th className="p-2">Bin</th><th className="p-2">Status</th>
                <th className="p-2">Manual reference</th><th className="p-2">Actions</th></tr>
            </thead>
            <tbody>{report.rows.map(row=><tr key={row.id} className="border-t border-slate-100">
              <td className="p-2 font-mono">{row.serialNumber}</td>
              <td className="p-2">{row.productName}</td>
              <td className="p-2">{row.warehouseName} / {row.locationName}</td>
              <td className="p-2">{row.status.replace("_"," ")}</td>
              <td className="p-2">{row.reference||"—"}</td>
              <td className="p-2">
                {canEdit&&<Button variant="outline" size="sm" onClick={()=>{
                  setEdited(row);setStatus(row.status);setReference(row.reference);setNotes(row.notes);
                }}>Edit custody</Button>}
                {row.status==="sold"&&<Button variant="outline" size="sm"
                  onClick={()=>checkInvoice(row.id)}>Check invoice product</Button>}
              </td>
            </tr>)}</tbody>
          </table>
        </div>
        {invoiceCheck&&<div role="status" className="rounded-lg border border-slate-200 p-3 text-sm">
          <p className="font-semibold">{invoiceCheck.serialNumber} · {invoiceCheck.status.replaceAll("_"," ")}</p>
          <p className="mt-1">{invoiceCheck.explanation}</p>
          {invoiceCheck.invoiceNumber&&<p className="mt-1 text-xs text-slate-600">
            Invoice: {invoiceCheck.invoiceNumber} · Date: {invoiceCheck.saleDate} ·
            {" "}Product units: {invoiceCheck.productQuantity??"not matched"}
          </p>}
          <p className="mt-2 text-xs text-amber-700">
            This checks invoice-product consistency only. Unique serial delivery and warranty eligibility are not verified.
          </p>
        </div>}
      </div>}
    </details>
  );
}
