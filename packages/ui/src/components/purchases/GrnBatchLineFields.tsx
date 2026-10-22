"use client";

import * as React from "react";
import { FormField, inputClass } from "../forms/FormField";

/** Windows Offline-only real GRN batch provenance; not live FEFO stock. */
export function GrnBatchLineFields({lineId,batch,expiresOn,disabled,onBatchChange,onExpiryChange}:{
  lineId:string;
  batch:string;
  expiresOn:string;
  disabled:boolean;
  onBatchChange:(value:string)=>void;
  onExpiryChange:(value:string)=>void;
}){
  return (
    <>
      <FormField label="Supplier batch / lot code (optional)">
        <input aria-label={`GRN batch code ${lineId}`} className={inputClass}
          maxLength={64} value={batch} placeholder="Batch printed on goods"
          disabled={disabled} onChange={e=>onBatchChange(e.target.value)} />
      </FormField>
      <FormField label="Batch expiry date (paired with code)">
        <input aria-label={`GRN batch expiry ${lineId}`} type="date"
          className={inputClass} value={expiresOn} disabled={disabled}
          onChange={e=>onExpiryChange(e.target.value)} />
      </FormField>
    </>
  );
}
