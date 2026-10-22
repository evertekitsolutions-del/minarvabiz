"use client";
import * as React from "react";
import {
  store, recordServiceVisitPart, voidServiceVisitPart,
  summarizeServiceVisitParts, type ServiceSiteVisit,
} from "@minarvabiz/business-logic";
import {Button} from "../Button";
import {inputClass,selectClass} from "../forms/FormField";

/**
 * Field technicians annotate parts consumed. This panel DOES NOT adjust
 * inventory stock, create a sale, book cost of goods or collect a payment.
 */
export function ServiceVisitPartsPanel({visit,canWrite,mutate}:{
  visit:ServiceSiteVisit;canWrite:boolean;
  mutate:(fn:()=>unknown,success:string)=>void;
}){
  const [productId,setProductId]=React.useState("");
  const [quantity,setQuantity]=React.useState("1");
  const [notes,setNotes]=React.useState("");
  const [voidId,setVoidId]=React.useState<string|null>(null);
  const [reason,setReason]=React.useState("");
  const editable=canWrite&&visit.status==="arrived";
  const products=store.listProducts().filter(p=>
    p.isActive&&(p.branchId==null||p.branchId===visit.branchId));
  const parts=visit.parts??[];
  const totals=summarizeServiceVisitParts(parts);
  const selected=products.find(p=>p.id===productId);
  return <details className="mt-2 max-w-[600px] rounded border border-slate-200 bg-white p-2">
    <summary className="cursor-pointer font-medium">
      Spare parts used ({totals.usedCount}, cost {(totals.totalCostMinor/100).toFixed(2)})
    </summary>
    <p className="mt-1 text-xs text-slate-500">
      Manual parts-used log only. Recording a part does not reduce product stock,
      book accounting cost, or add it to the customer's invoice. Post stock
      consumption separately using the authorized inventory workflow.
    </p>
    {editable&&<div className="mt-2 grid gap-2 sm:grid-cols-2">
      <label className="text-xs font-medium">Active branch or shared-catalog part
        <select aria-label={"Service part product "+visit.id}
          className={selectClass+" mt-1"} value={productId}
          onChange={e=>setProductId(e.target.value)}>
          <option value="">Choose inventory part</option>
          {products.map(p=><option key={p.id} value={p.id}>
            {p.name} {p.sku?"("+p.sku+")":""}
          </option>)}
        </select>
      </label>
      <label className="text-xs font-medium">Used quantity (up to 3 decimals)
        <input aria-label={"Service part quantity "+visit.id}
          type="text" inputMode="decimal" value={quantity}
          className={inputClass+" mt-1"} onChange={e=>setQuantity(e.target.value)}/>
      </label>
      <label className="text-xs font-medium sm:col-span-2">What was installed / used?
        <input aria-label={"Service part notes "+visit.id} value={notes}
          className={inputClass+" mt-1"} maxLength={500}
          onChange={e=>setNotes(e.target.value)}/>
      </label>
      <p className="text-xs text-slate-500 sm:col-span-2">
        Cost reference: {selected
          ? selected.costPrice.toFixed(2)+" per "+selected.unit+" (original master cost)"
          : "Select a part"}
      </p>
      <div className="sm:col-span-2">
        <Button size="sm" variant="outline" disabled={!selected||!quantity.trim()}
          onClick={()=>mutate(()=>{recordServiceVisitPart({
            visitId:visit.id,expectedVersion:visit.version,productId,quantity,notes,
          });setProductId("");setQuantity("1");setNotes("");},
          "Service part usage recorded without posting stock")}>
          Record part used
        </Button>
      </div>
    </div>}
    {parts.length===0&&<p className="mt-2 text-xs text-slate-500">
      No parts recorded for this service visit.
    </p>}
    {parts.map(part=><div key={part.id}
      className="mt-2 border-t border-slate-100 py-2 text-xs">
      <p className={part.status==="voided"?"text-slate-400 line-through":"text-slate-700"}>
        <strong>{part.productName}</strong> — {(part.quantityMilli/1000).toFixed(3)}
        {" "}{part.unit} × {(part.unitCostMinor/100).toFixed(2)}
        {" "} = {(part.totalCostMinor/100).toFixed(2)}
      </p>
      {part.notes&&<p className="text-slate-500">{part.notes}</p>}
      {part.status==="voided"?<p className="text-slate-500">
        Corrected: {part.voidReason} (no stock or financial posting was performed)
      </p>:editable&&<Button size="sm" variant="outline"
        onClick={()=>{setVoidId(part.id);setReason("");}}>Void entry</Button>}
      {editable&&voidId===part.id&&part.status==="used"&&<div className="mt-2 space-y-1">
        <label className="block text-xs font-medium">Correction reason
          <input aria-label={"Void service part reason "+part.id} value={reason}
            maxLength={500} className={inputClass+" mt-1"}
            onChange={e=>setReason(e.target.value)}/>
        </label>
        <Button size="sm" variant="outline" disabled={reason.trim().length<3}
          onClick={()=>mutate(()=>{voidServiceVisitPart({
            visitId:visit.id,expectedVersion:visit.version,partId:part.id,reason,
          });setVoidId(null);},"Part usage correction recorded")}>
          Confirm correction
        </Button>
        <Button size="sm" variant="outline" onClick={()=>setVoidId(null)}>
          Keep entry
        </Button>
      </div>}
    </div>)}
  </details>;
}
