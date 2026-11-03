"use client";
import * as React from "react";
import type { Customer, PaymentMethod, Supplier } from "@minarvabiz/types";
import { Button } from "../Button";
import { FormField, inputClass, selectClass } from "../forms/FormField";
import { calculateLaundryProfit } from "@minarvabiz/business-logic";
import { formatMoney } from "../customers/format";

type GarmentRow = { key: number; label: string; quantity: string; notes: string };
type LaundrySubmit = {
  customerId: string; garment: string; quantity: number;
  items: Array<{ label: string; quantity: number; notes: string | null }>;
  pickupAt: string | null; dueAt: string | null;
  supplierId: string | null; supplierRate: number; customerRate: number;
  paidAmount: number; paymentMethod: PaymentMethod; notes: string;
};
type LegacyLaundrySubmit = Omit<LaundrySubmit, "items" | "pickupAt" | "dueAt">;

export function LaundryForm({mode,customers,suppliers,onSubmit,onCancel,onAddCustomer,onAddSupplier,error}:{mode:"outsourced"|"in_house_ironing";customers:Customer[];suppliers:Supplier[];onSubmit:(data:LegacyLaundrySubmit)=>void;onCancel:()=>void;onAddCustomer?:()=>void;onAddSupplier?:()=>void;error?:string|null}){
 const [customerId,setCustomerId]=React.useState("");
 const [rows,setRows]=React.useState<GarmentRow[]>([{key:1,label:"",quantity:"1",notes:""}]);
 const [nextKey,setNextKey]=React.useState(2);
 const [pickupAt,setPickupAt]=React.useState("");
 const [dueAt,setDueAt]=React.useState("");
 const [supplierId,setSupplierId]=React.useState("");
 const [supplierRate,setSupplierRate]=React.useState(mode==="outsourced"?"100":"0");
 const [customerRate,setCustomerRate]=React.useState("150");
 const [paidAmount,setPaidAmount]=React.useState("");
 const [paymentMethod,setPaymentMethod]=React.useState<PaymentMethod>("cash");
 const [notes,setNotes]=React.useState("");
 const quantity=rows.reduce((sum,row)=>sum+(Number(row.quantity)||0),0);
 const preview=calculateLaundryProfit({customerRate:parseFloat(customerRate)||0,supplierRate:mode==="in_house_ironing"?0:parseFloat(supplierRate)||0,quantity:quantity>0?quantity:1});
 const updateRow=(key:number,patch:Partial<GarmentRow>)=>setRows(current=>current.map(row=>row.key===key?{...row,...patch}:row));
 return <div className="space-y-3">
  <FormField label="Customer *"><div className="flex gap-2"><select className={selectClass} value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Select</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><Button type="button" size="sm" variant="outline" onClick={onAddCustomer} aria-label="Add customer">+</Button></div></FormField>
  <div className="space-y-2 rounded-xl border border-slate-200 p-3">
   <div className="flex items-center justify-between"><strong className="text-sm">Garments / Items</strong><Button type="button" size="sm" variant="outline" disabled={rows.length>=100} onClick={()=>{setRows(current=>[...current,{key:nextKey,label:"",quantity:"1",notes:""}]);setNextKey(x=>x+1);}}>+ Add item</Button></div>
   {rows.map((row,index)=><div key={row.key} className="grid grid-cols-[minmax(0,1fr)_88px_auto] gap-2 rounded-lg bg-slate-50 p-2">
    <div className="space-y-2"><FormField label={index===0?"Garment":`Garment ${index+1}`}><input className={inputClass} value={row.label} onChange={e=>updateRow(row.key,{label:e.target.value})} placeholder="Shirt, Saree, Trouser…"/></FormField><input aria-label={`Item ${index+1} notes`} className={inputClass} value={row.notes} onChange={e=>updateRow(row.key,{notes:e.target.value})} placeholder="Item notes (optional)"/></div>
    <FormField label="Quantity"><input aria-label={`Item ${index+1} quantity`} type="number" min="0.001" step="0.001" className={inputClass} value={row.quantity} onChange={e=>updateRow(row.key,{quantity:e.target.value})}/></FormField>
    <Button type="button" size="sm" variant="danger" disabled={rows.length===1} onClick={()=>setRows(current=>current.filter(item=>item.key!==row.key))} aria-label={`Remove item ${index+1}`}>×</Button>
   </div>)}
   <p className="text-xs text-slate-500">{rows.length} item row(s) · {quantity} total pieces</p>
  </div>
  <div className="grid grid-cols-2 gap-3"><FormField label="Pickup date"><input type="date" className={inputClass} value={pickupAt} onChange={e=>setPickupAt(e.target.value)}/></FormField><FormField label="Due / delivery date"><input type="date" min={pickupAt||undefined} className={inputClass} value={dueAt} onChange={e=>setDueAt(e.target.value)}/></FormField></div>
  <div className="grid grid-cols-2 gap-3"><FormField label="Customer rate *"><input type="number" min="0" step="0.01" className={inputClass} value={customerRate} onChange={e=>setCustomerRate(e.target.value)}/></FormField>{mode==="outsourced"&&<FormField label="Supplier rate *"><input type="number" min="0" step="0.01" className={inputClass} value={supplierRate} onChange={e=>setSupplierRate(e.target.value)}/></FormField>}</div>
  {mode==="outsourced"&&<FormField label="Laundry supplier *"><div className="flex gap-2"><select className={selectClass} value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">Select</option>{suppliers.filter(s=>!s.category||s.category==="laundry").map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><Button type="button" size="sm" variant="outline" onClick={onAddSupplier} aria-label="Add supplier">+</Button></div></FormField>}
  <div className="grid grid-cols-2 gap-3"><FormField label="Paid now"><input type="number" min="0" step="0.01" className={inputClass} value={paidAmount} onChange={e=>setPaidAmount(e.target.value)}/></FormField><FormField label="Payment method"><select aria-label="Laundry payment method" className={selectClass} value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as PaymentMethod)}><option value="cash">Cash</option><option value="bank">Bank</option><option value="card">Card</option><option value="upi">UPI</option><option value="online">Online</option><option value="other">Other</option></select></FormField></div>
  <FormField label="Ticket notes"><textarea className={inputClass} value={notes} onChange={e=>setNotes(e.target.value)}/></FormField>
  <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><div className="flex justify-between"><span>Customer total</span><strong>{formatMoney(preview.totalCustomerCharge)}</strong></div>{mode==="outsourced"&&<div className="flex justify-between"><span>Supplier cost</span><span>{formatMoney(preview.totalSupplierCost)}</span></div>}<div className="flex justify-between"><span>Profit</span><strong>{formatMoney(preview.totalProfit)}</strong></div></div>
  {error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}
  <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="button" disabled={!customerId||rows.some(row=>!row.label.trim()||!(Number(row.quantity)>0))||!quantity||(mode==="outsourced"&&!supplierId)} onClick={()=>onSubmit(({customerId,garment:rows.map(row=>row.label.trim()).join(", "),quantity,items:rows.map(row=>({label:row.label.trim(),quantity:Number(row.quantity),notes:row.notes.trim()||null})),pickupAt:pickupAt||null,dueAt:dueAt||null,supplierId:supplierId||null,supplierRate:parseFloat(supplierRate)||0,customerRate:parseFloat(customerRate)||0,paidAmount:parseFloat(paidAmount)||0,paymentMethod,notes}) as LegacyLaundrySubmit)}>Save ticket</Button></div>
 </div>;
}
