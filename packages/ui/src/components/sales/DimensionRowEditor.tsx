"use client";
import * as React from "react";
import { previewDimensionRow, type DimensionRowDraft, type DimensionMeasurement } from "@minarvabiz/business-logic";
export interface DimensionRowEditorProps {
  readonly value: DimensionRowDraft;
  readonly onChange: (draft: DimensionRowDraft) => void;
  readonly onApply: (measurement: DimensionMeasurement) => void;
  readonly disabled?: boolean;
}
/** Presentation-only quantity editor; parent owns tenant/line reset and persistence. */
export function DimensionRowEditor({value, onChange, onApply, disabled = false}: DimensionRowEditorProps) {
  const id = React.useId();
  const preview = previewDimensionRow(value);
  const errorId = `${id}-error`;
  const update = <K extends keyof DimensionRowDraft>(key: K, next: DimensionRowDraft[K]) => {
    if (!disabled) onChange({...value, [key]: next});
  };
  const controlClass = "h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm disabled:opacity-60";
  const units = ["mm", "cm", "m", "in", "ft"] as const;
  const invalid = !preview.valid;
  return (
    <fieldset disabled={disabled} className="space-y-2 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium">Area quantity</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(["length", "width"] as const).map(key => (
          <div key={key} className="space-y-1">
            <label htmlFor={`${id}-${key}`} className="block text-xs font-medium">{key === "length" ? "Length" : "Width"}</label>
            <input id={`${id}-${key}`} type="text" inputMode="decimal" autoComplete="off"
              value={value[key]} onChange={event => update(key, event.target.value)}
              aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} className={controlClass}/>
            <label htmlFor={`${id}-${key}-unit`} className="block text-xs">{key === "length" ? "Length unit" : "Width unit"}</label>
            <select id={`${id}-${key}-unit`} value={value[`${key}Unit`]}
              onChange={event => update(`${key}Unit`, event.target.value as DimensionRowDraft['lengthUnit'])}
              className={controlClass}>
              {units.map(unit => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </div>
        ))}
        <div className="space-y-1">
          <label htmlFor={`${id}-pieces`} className="block text-xs font-medium">Pieces</label>
          <input id={`${id}-pieces`} type="text" inputMode="numeric" autoComplete="off"
            value={value.pieces} onChange={event => update("pieces", event.target.value)}
            aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} className={controlClass}/>
          <label htmlFor={`${id}-billable`} className="block text-xs">Billable unit</label>
          <select id={`${id}-billable`} value={value.billableUnit}
            onChange={event => update("billableUnit", event.target.value as DimensionRowDraft['billableUnit'])}
            className={controlClass}>
            <option value="sqft">sqft</option><option value="sqm">sqm</option>
          </select>
        </div>
      </div>
      {preview.valid
        ? <p role="status" className="text-sm font-medium">{`${preview.measurement.quantity} ${preview.measurement.billableUnit}`}</p>
        : <p id={errorId} role="alert" className="text-sm text-rose-700">{preview.error}</p>}
      <button type="button" disabled={disabled || !preview.valid}
        className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        onClick={() => { if (!disabled && preview.valid) onApply(preview.measurement); }}>
        Apply quantity
      </button>
    </fieldset>
  );
}
