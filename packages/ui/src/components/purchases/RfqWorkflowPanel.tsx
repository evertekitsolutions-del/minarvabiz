"use client";
import * as React from "react";
import type { Supplier } from "@minarvabiz/types";
import {
  awardProcurementRfq, cancelProcurementRfq, compareProcurementRfqQuotes,
  issueProcurementRfq, listProcurementRfqs, recordProcurementRfqQuote,
  type ProcurementRfq,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { inputClass, selectClass } from "../forms/FormField";
import { formatMoney } from "../customers/format";

type QuoteEntry = { productId: string; unitCost: string; taxRate: string };
interface Props { suppliers: readonly Supplier[]; onChanged?: () => void | Promise<void> }

/** Complete local RFQ intake through selected vendor quote -> existing draft PO. */
export function RfqWorkflowPanel({ suppliers, onChanged }: Props) {
  const [revision, setRevision] = React.useState(0);
  const [selectedId, setSelectedId] = React.useState("");
  const [supplierId, setSupplierId] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [validUntil, setValidUntil] = React.useState("");
  const [bidLines, setBidLines] = React.useState<QuoteEntry[]>([]);
  const [confirmAward, setConfirmAward] = React.useState("");
  const [feedback, setFeedback] = React.useState<{ok: boolean; message: string} | null>(null);
  // The source of truth is the existing local-first business-logic store.
  void revision;
  const rfqs = listProcurementRfqs();
  const selected = rfqs.find(r=>r.id===selectedId) ?? null;
  const quotes = selected ? compareProcurementRfqQuotes(selected.id) : [];

  function refresh() {
    setRevision(v=>v+1);
    void onChanged?.();
  }
  function run(action:()=>string) {
    setFeedback(null);
    try {
      const message=action();
      refresh();
      setFeedback({ok:true,message});
    } catch(cause) {
      setFeedback({ok:false,message:cause instanceof Error?cause.message:String(cause)});
    }
  }
  function selectRfq(r:ProcurementRfq) {
    setSelectedId(r.id);
    setSupplierId("");
    setReference("");
    setValidUntil(r.requiredBy);
    setBidLines(r.lines.map(l=>({productId:l.productId,unitCost:"",taxRate:"0"})));
    setFeedback(null);setConfirmAward("");
  }
  function chooseSupplier(id:string) {
    setSupplierId(id);
    const current = selected?.quotes.find(q=>q.supplierId===id);
    setReference(current?.quoteReference??"");
    setValidUntil(current?.validUntil??selected?.requiredBy??"");
    setBidLines(selected?.lines.map(l=>{
      const old=current?.lines.find(x=>x.productId===l.productId);
      return {productId:l.productId,unitCost:old?String(old.unitCost):"",taxRate:old?String(old.taxRate):"0"};
    })??[]);
    setConfirmAward("");
  }
  function submitBid() {
    if(!selected) return;
    run(()=>{
      const next=recordProcurementRfqQuote(selected.id,selected.version,{
        supplierId,quoteReference:reference,validUntil,lines:bidLines,
      });
      chooseSupplier(supplierId);
      return "Supplier quote saved for RFQ "+next.reference+".";
    });
  }
  return <details className="rounded-xl border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer text-base font-semibold text-slate-900">Saved RFQs, supplier bids & purchase orders</summary>
    <p className="my-2 text-xs text-slate-600">
      Issue an RFQ, record all supplier quotes, compare totals and award a single supplier.
      The winning quote creates a draft Purchase Order in the existing approval, GRN and invoice workflow.
      Sending the enquiry to suppliers is manual; no email is automatically dispatched.
    </p>
    {feedback&&<p role={feedback.ok?"status":"alert"} className={"my-2 text-sm "+(feedback.ok?"text-green-700":"text-red-700")}>{feedback.message}</p>}
    <div className="grid gap-2 lg:grid-cols-3">
      <div className="max-h-64 space-y-1 overflow-y-auto rounded border border-slate-200 p-2">
        {rfqs.length===0&&<p className="text-sm text-slate-500">No RFQs saved yet. Create one from the enquiry form above.</p>}
        {rfqs.map(r=><button type="button" key={r.id} onClick={()=>selectRfq(r)}
          className={"w-full rounded p-2 text-left text-sm "+(r.id===selectedId?"bg-blue-50 text-blue-900":"hover:bg-slate-50")}>
          <strong>{r.reference}</strong>
          <span className="ml-2 text-xs">{r.status}</span>
          <div className="text-xs text-slate-500">{r.supplierIds.length} suppliers · {r.quotes.length} bids · Due {r.requiredBy}</div>
        </button>)}
      </div>
      {selected&&<div className="space-y-2 rounded border border-slate-200 p-3 lg:col-span-2">
        <div className="flex flex-wrap items-center gap-2">
          <strong>{selected.reference}</strong><span className="text-xs text-slate-500">Version {selected.version} · {selected.status}</span>
        </div>
        <p className="text-xs text-slate-500">Required delivery: {selected.requiredBy}. {selected.notes}</p>
        {selected.status==="draft"&&<Button size="sm" onClick={()=>run(()=>{
          issueProcurementRfq(selected.id,selected.version);
          return "RFQ issued. Send the exported enquiry to selected suppliers.";
        })}>Issue RFQ</Button>}
        {selected.status!=="awarded"&&selected.status!=="cancelled"&&<Button size="sm" variant="outline"
          onClick={()=>run(()=>{cancelProcurementRfq(selected.id,selected.version);return "RFQ cancelled.";})}>Cancel RFQ</Button>}
        {selected.status==="awarded"&&<p className="text-sm font-medium text-green-700">
          Awarded to {suppliers.find(s=>s.id===selected.awardedSupplierId)?.name??selected.awardedSupplierId}.
          PO: {selected.purchaseOrderId}. Approve the draft in Purchase Orders below.
        </p>}
        {selected.status==="issued"&&<>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs">Supplier
              <select aria-label="Bid supplier" className={selectClass} value={supplierId} onChange={e=>chooseSupplier(e.target.value)}>
                <option value="">Select supplier</option>
                {selected.supplierIds.map(id=><option key={id} value={id}>{suppliers.find(s=>s.id===id)?.name??id}</option>)}
              </select>
            </label>
            <label className="text-xs">Vendor quote reference
              <input aria-label="Bid reference" className={inputClass} maxLength={128}
                value={reference} onChange={e=>setReference(e.target.value)}/>
            </label>
            <label className="text-xs">Quote valid through
              <input aria-label="Bid validity date" type="date" className={inputClass}
                value={validUntil} onChange={e=>setValidUntil(e.target.value)}/>
            </label>
          </div>
          {supplierId&&<div className="space-y-2">
            {selected.lines.map(line=>{
              const bid=bidLines.find(x=>x.productId===line.productId);
              return <div key={line.productId} className="grid items-end gap-2 rounded border border-slate-100 p-2 sm:grid-cols-4">
                <span className="text-sm">{line.description} · {line.quantity} {line.unit}</span>
                <label className="text-xs sm:col-span-2">Quoted unit cost (excl. tax)
                  <input aria-label={"Quoted cost "+line.productId} className={inputClass} inputMode="decimal"
                    placeholder="0.00" value={bid?.unitCost??""} onChange={e=>setBidLines(v=>v.map(x=>x.productId===line.productId?{...x,unitCost:e.target.value}:x))}/>
                </label>
                <label className="text-xs">Tax %
                  <input aria-label={"Quoted tax "+line.productId} className={inputClass} inputMode="decimal"
                    value={bid?.taxRate??"0"} onChange={e=>setBidLines(v=>v.map(x=>x.productId===line.productId?{...x,taxRate:e.target.value}:x))}/>
                </label>
              </div>;
            })}
            <Button size="sm" disabled={!reference.trim()||!validUntil||bidLines.some(l=>!l.unitCost)} onClick={submitBid}>
              Save / update supplier quotation
            </Button>
          </div>}
        </>}
        {quotes.length>0&&<div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-xs text-slate-500">
              <th className="p-2">Supplier</th><th>Quote ref</th><th>Valid until</th><th>Subtotal</th><th>Tax</th><th>Total</th><th>Action</th>
            </tr></thead><tbody>{quotes.map((q,i)=><tr className="border-b" key={q.supplierId}>
              <td className="p-2">{suppliers.find(s=>s.id===q.supplierId)?.name??q.supplierId}{i===0?" · Lowest":""}</td>
              <td>{q.quoteReference}</td><td>{q.validUntil}</td>
              <td>{formatMoney(q.subtotal)}</td><td>{formatMoney(q.taxAmount)}</td><td>{formatMoney(q.total)}</td>
              <td>{selected.status==="issued"&&(confirmAward===q.supplierId
                ?<Button size="sm" onClick={()=>run(()=>{
                  const result=awardProcurementRfq(selected.id,selected.version,q.supplierId);
                  setConfirmAward("");
                  return "Draft "+result.purchaseOrder.poNumber+" created. Approve it below before receiving stock.";
                })}>Confirm selected vendor</Button>
                :<Button size="sm" variant="outline" onClick={()=>setConfirmAward(q.supplierId)}>
                  Select winning quote
                </Button>)}</td>
            </tr>)}</tbody>
          </table>
          {confirmAward&&<p className="text-xs text-amber-700">Confirming creates one draft PO. This does not pay, invoice or receive stock.</p>}
        </div>}
      </div>}
    </div>
  </details>;
}
