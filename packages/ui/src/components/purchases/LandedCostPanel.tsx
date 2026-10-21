"use client";

import * as React from "react";
import type { GoodsReceipt } from "@minarvabiz/types";
import {
  buildLandedCostPreview, phase9Store,
  type LandedAllocationMethod, type LandedCostPreview,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { inputClass, selectClass } from "../forms/FormField";
import { formatMoney } from "../customers/format";

/** Operator preview only — no physical/financial posting or product repricing. */
export function LandedCostPanel({ goodsReceipts }: { goodsReceipts: readonly GoodsReceipt[] }) {
  const [receiptId, setReceiptId] = React.useState("");
  const [method, setMethod] = React.useState<LandedAllocationMethod>("value");
  const [freight, setFreight] = React.useState("0");
  const [insurance, setInsurance] = React.useState("0");
  const [customsDuty, setCustomsDuty] = React.useState("0");
  const [other, setOther] = React.useState("0");
  const [preview, setPreview] = React.useState<LandedCostPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const activeBranchId = phase9Store.getActiveBranch()?.id ?? null;
  const available = goodsReceipts.filter(r =>
    r.branchId == null || r.branchId === activeBranchId);
  function invalidate(){ setPreview(null); setError(null); }
  function calculate(){
    invalidate();
    try{
      const receipt = available.find(r => r.id === receiptId);
      if(!receipt) throw new Error("Select a goods receipt in the active branch");
      setPreview(buildLandedCostPreview(receipt,{
        method, costs:{freight,insurance,customsDuty,other},
      }, phase9Store.getActiveBranch()?.id ?? null));
    }catch(e){setError(e instanceof Error ? e.message : "Unable to preview landed cost");}
  }
  function exportCsv(){
    if(!preview)return;
    setError(null);
    try{
      const url = URL.createObjectURL(new Blob(["\uFEFF",preview.csv],{type:"text/csv;charset=utf-8"}));
      const link=document.createElement("a");
      link.href=url;
      link.download="minarvabiz-landed-cost-"+preview.grnNumber.replace(/[^a-zA-Z0-9-]/g,"_")+".csv";
      document.body.appendChild(link);
      try{link.click();}
      finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
    }catch(e){setError(e instanceof Error?e.message:"CSV export failed");}
  }

  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-base font-semibold text-slate-900">
        Landed cost allocation (freight, duty and insurance)
      </summary>
      <p className="mt-2 text-xs text-slate-600">
        Allocate additional receipt expenses proportionally by received value or quantity.
        Planning preview only: no stock valuation, supplier invoice, cost price or journal is changed.
        Verify item units and expense classification before any separate accounting entry.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-medium text-slate-600">
          Goods receipt (GRN)
          <select aria-label="Landed cost goods receipt" className={selectClass + " mt-1"}
            value={receiptId} onChange={e=>{setReceiptId(e.target.value);invalidate();}}>
            <option value="">Select goods receipt</option>
            {available.map(r=>(
              <option key={r.id} value={r.id}>{r.grnNumber} · {r.supplierName || r.supplierId} · {r.receiptDate.slice(0,10)}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Allocation basis
          <select aria-label="Landed cost allocation basis" className={selectClass + " mt-1"}
            value={method} onChange={e=>{setMethod(e.target.value as LandedAllocationMethod);invalidate();}}>
            <option value="value">By existing receipt value</option>
            <option value="quantity">By received quantity (same units only)</option>
          </select>
        </label>
        {([
          ["Freight",freight,setFreight],
          ["Insurance",insurance,setInsurance],
          ["Customs duty",customsDuty,setCustomsDuty],
          ["Other charges",other,setOther],
        ] as Array<[string,string,React.Dispatch<React.SetStateAction<string>>]>).map(([label,value,setter])=>(
          <label key={label} className="text-xs font-medium text-slate-600">
            {label}
            <input aria-label={"Landed cost "+label} className={inputClass + " mt-1"}
              value={value} inputMode="decimal" placeholder="0.00" onChange={e=>{setter(e.target.value);invalidate();}} />
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={calculate}>Preview landed cost</Button>
        {preview && <Button size="sm" variant="outline" onClick={exportCsv}>Export landed cost CSV</Button>}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
      {preview && (
        <div className="mt-4 space-y-3">
          <p role="status" className="text-sm font-semibold text-slate-800">
            {preview.grnNumber} · Base {formatMoney(preview.baseSubtotal)} + Additional {formatMoney(preview.additionalCosts)}
            {" = "} Estimated landed {formatMoney(preview.estimatedLandedTotal)}
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-[700px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr><th className="p-2">Receipt item</th><th className="p-2">Qty</th>
                  <th className="p-2 text-right">Base value</th>
                  <th className="p-2 text-right">Allocated extras</th>
                  <th className="p-2 text-right">Landed total</th>
                  <th className="p-2 text-right">Estimated unit cost</th></tr>
              </thead>
              <tbody>{preview.rows.map(row=>(
                <tr key={row.receiptLineId} className="border-t border-slate-100">
                  <td className="p-2">{row.description}</td>
                  <td className="p-2">{row.receivedQuantity}</td>
                  <td className="p-2 text-right">{formatMoney(row.baseCost)}</td>
                  <td className="p-2 text-right">{formatMoney(row.allocatedExtraCost)}</td>
                  <td className="p-2 text-right">{formatMoney(row.landedCost)}</td>
                  <td className="p-2 text-right">{row.landedUnitCost.toFixed(4)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </details>
  );
}
