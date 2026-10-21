"use client";

import * as React from "react";
import {
  inspectGs1Barcode, type Gs1BarcodeInspection, type Gs1BarcodeType,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { inputClass, selectClass } from "../forms/FormField";

/** Read-only GS1 assistant: does not change product barcode or assign a GTIN. */
export function ProductGs1BarcodeAssistant() {
  const [kind,setKind]=React.useState<Gs1BarcodeType>("ean13");
  const [value,setValue]=React.useState("");
  const [result,setResult]=React.useState<Gs1BarcodeInspection|null>(null);
  const [error,setError]=React.useState<string|null>(null);
  function clear(){setResult(null);setError(null);}
  function inspect(){
    clear();
    try{setResult(inspectGs1Barcode(value,kind));}
    catch(e){setError(e instanceof Error?e.message:"Barcode cannot be validated");}
  }
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-base font-semibold text-slate-900">
        EAN / UPC barcode check & check-digit generator
      </summary>
      <p className="mt-2 text-xs text-slate-600">
        Validate a manufacturer-assigned EAN-13, EAN-8 or UPC-A barcode before
        using it on product labels. Enter all digits to verify; omit the final
        digit to calculate the check digit. This does not assign a GTIN or
        check barcode ownership/duplicates. Internal Code128 and QR codes remain supported separately.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-600">
          Barcode standard
          <select aria-label="GS1 barcode standard" className={selectClass+" mt-1"}
            value={kind} onChange={e=>{setKind(e.target.value as Gs1BarcodeType);clear();}}>
            <option value="ean13">EAN-13 (13 digits)</option>
            <option value="ean8">EAN-8 (8 digits)</option>
            <option value="upc">UPC-A (12 digits)</option>
          </select>
        </label>
        <label className="min-w-52 flex-1 text-xs font-medium text-slate-600">
          Printed code / body without final check digit
          <input aria-label="GS1 barcode digits" className={inputClass+" mt-1"}
            value={value} maxLength={80} inputMode="numeric" placeholder="4006381333931"
            onChange={e=>{setValue(e.target.value);clear();}} />
        </label>
        <Button variant="outline" size="sm" onClick={inspect}>Check GS1 barcode</Button>
      </div>
      {error&&<p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {result&&(
        <div role="status" className="mt-3 space-y-1 rounded-lg border border-slate-200 p-3">
          <p className={"text-sm font-semibold "+(result.valid?"text-emerald-700":"text-rose-700")}>
            {result.generated?"Proposed complete code":result.valid?"Valid check digit":"Invalid check digit"}
            {": "}<span className="font-mono">{result.completeCode}</span>
          </p>
          <p className="text-sm text-slate-700">{result.explanation}</p>
          <p className="text-xs text-slate-500">Expected last digit: {result.expectedCheckDigit}</p>
        </div>
      )}
    </details>
  );
}
