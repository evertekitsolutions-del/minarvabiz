"use client";

import * as React from "react";
import type { MeasurementFields } from "@minarvabiz/types";
import { FormField, inputClass } from "../forms/FormField";

const FIELDS: Array<{ key: keyof MeasurementFields; label: string }> = [
  { key: "shoulder", label: "Shoulder" },
  { key: "chest", label: "Chest" },
  { key: "waist", label: "Waist" },
  { key: "hip", label: "Hip" },
  { key: "sleeve", label: "Sleeve" },
  { key: "armhole", label: "Armhole" },
  { key: "length", label: "Length" },
  { key: "neck", label: "Neck" },
  { key: "pantLength", label: "Pant length" },
  { key: "topLength", label: "Top length" },
  { key: "bottomLength", label: "Bottom length" },
];

export function MeasurementForm({
  value,
  onChange,
}: {
  value: MeasurementFields;
  onChange: (v: MeasurementFields) => void;
}) {
  function set(key: keyof MeasurementFields, raw: string) {
    const num = raw === "" ? null : parseFloat(raw);
    onChange({ ...value, [key]: num });
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {FIELDS.map((f) => (
        <FormField key={f.key} label={f.label}>
          <input
            type="number"
            step="0.1"
            className={inputClass}
            value={(value[f.key] as number | null | undefined) ?? ""}
            onChange={(e) => set(f.key, e.target.value)}
          />
        </FormField>
      ))}
    </div>
  );
}
