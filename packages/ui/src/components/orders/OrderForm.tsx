"use client";

import * as React from "react";
import type {
  Customer, ServiceType, MeasurementFields, MeasurementProfile, TshirtDetails,
} from "@minarvabiz/types";
import { Button } from "../Button";
import { FormField, inputClass, selectClass } from "../forms/FormField";
import { MeasurementForm } from "../measurements/MeasurementForm";
import { SERVICE_TYPE_LABELS, calculateOrderPricing } from "@minarvabiz/business-logic";
import { formatMoney } from "../customers/format";

export interface OrderFormValues {
  customerId: string;
  serviceType: ServiceType;
  deliveryDate: string;
  price: string;
  discount: string;
  advance: string;
  notes: string;
  materialDetails: string;
  customerSuppliedMaterial: boolean;
  shopSuppliedMaterial: boolean;
  measurements: MeasurementFields;
  measurementProfileId: string;
  externalMaterialCost: string;
  quantity: string;
  unitPrice: string;
  bulkDiscount: string;
  tshirt: TshirtDetails;
}

const defaultTshirt: TshirtDetails = {
  tshirtType: "",
  size: "",
  color: "",
  quantity: 1,
  printingType: "",
  designDescription: "",
  printingCost: 0,
  customerPrice: 0,
};

export function emptyOrderForm(): OrderFormValues {
  return {
    customerId: "",
    serviceType: "ladies_tailoring",
    deliveryDate: "",
    price: "",
    discount: "0",
    advance: "0",
    notes: "",
    materialDetails: "",
    customerSuppliedMaterial: false,
    shopSuppliedMaterial: true,
    measurements: {},
    measurementProfileId: "",
    externalMaterialCost: "0",
    quantity: "1",
    unitPrice: "",
    bulkDiscount: "0",
    tshirt: { ...defaultTshirt },
  };
}

export function OrderForm({
  customers,
  profiles,
  value,
  onChange,
  onLoadProfiles,
  onSubmit,
  onCancel,
  error,
}: {
  customers: Customer[];
  profiles: MeasurementProfile[];
  value: OrderFormValues;
  onChange: (v: OrderFormValues) => void;
  onLoadProfiles?: (customerId: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  error?: string | null;
}) {
  const isBulk = value.serviceType === "wholesale" || value.serviceType === "uniform";
  const isWedding = value.serviceType === "wedding_dress";
  const isTshirt = value.serviceType === "tshirt_printing";
  const isTailoring =
    value.serviceType === "ladies_tailoring" ||
    value.serviceType === "gents_tailoring" ||
    value.serviceType === "ladies_alteration" ||
    value.serviceType === "gents_alteration" ||
    isWedding;

  const preview = React.useMemo(() => {
    return calculateOrderPricing({
      serviceType: value.serviceType,
      price: parseFloat(value.price) || 0,
      discount: parseFloat(value.discount) || 0,
      advance: parseFloat(value.advance) || 0,
      quantity: parseInt(value.quantity, 10) || 1,
      unitPrice: parseFloat(value.unitPrice) || undefined,
      bulkDiscount: parseFloat(value.bulkDiscount) || 0,
      externalMaterialCost: parseFloat(value.externalMaterialCost) || 0,
      tshirt: isTshirt
        ? {
            ...value.tshirt,
            quantity: value.tshirt.quantity || 1,
            printingCost: value.tshirt.printingCost || 0,
            customerPrice: value.tshirt.customerPrice || parseFloat(value.price) || 0,
          }
        : null,
    });
  }, [value, isTshirt]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Customer *">
          <select
            className={selectClass}
            value={value.customerId}
            onChange={(e) => {
              onChange({ ...value, customerId: e.target.value, measurementProfileId: "" });
              onLoadProfiles?.(e.target.value);
            }}
          >
            <option value="">Select customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.phone ? ` (${c.phone})` : ""}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Service type *">
          <select
            className={selectClass}
            value={value.serviceType}
            onChange={(e) => onChange({ ...value, serviceType: e.target.value as ServiceType })}
          >
            {(Object.keys(SERVICE_TYPE_LABELS) as ServiceType[]).map((t) => (
              <option key={t} value={t}>{SERVICE_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Delivery date">
          <input
            type="date"
            className={inputClass}
            value={value.deliveryDate}
            onChange={(e) => onChange({ ...value, deliveryDate: e.target.value })}
          />
        </FormField>
        {!isBulk && !isTshirt && (
          <FormField label="Price *">
            <input
              type="number"
              className={inputClass}
              value={value.price}
              onChange={(e) => onChange({ ...value, price: e.target.value })}
            />
          </FormField>
        )}
        {!isBulk && (
          <FormField label="Discount">
            <input
              type="number"
              className={inputClass}
              value={value.discount}
              onChange={(e) => onChange({ ...value, discount: e.target.value })}
            />
          </FormField>
        )}
        <FormField label="Advance">
          <input
            type="number"
            className={inputClass}
            value={value.advance}
            onChange={(e) => onChange({ ...value, advance: e.target.value })}
          />
        </FormField>
      </div>

      {isBulk && (
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-3">
          <FormField label="Quantity *">
            <input type="number" className={inputClass} value={value.quantity}
              onChange={(e) => onChange({ ...value, quantity: e.target.value })} />
          </FormField>
          <FormField label="Unit price *">
            <input type="number" className={inputClass} value={value.unitPrice}
              onChange={(e) => onChange({ ...value, unitPrice: e.target.value })} />
          </FormField>
          <FormField label="Bulk discount">
            <input type="number" className={inputClass} value={value.bulkDiscount}
              onChange={(e) => onChange({ ...value, bulkDiscount: e.target.value })} />
          </FormField>
        </div>
      )}

      {isTshirt && (
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-cyan-100 bg-cyan-50/50 p-4 sm:grid-cols-2">
          <FormField label="T-shirt type">
            <input className={inputClass} value={value.tshirt.tshirtType ?? ""}
              onChange={(e) => onChange({ ...value, tshirt: { ...value.tshirt, tshirtType: e.target.value } })} />
          </FormField>
          <FormField label="Size">
            <input className={inputClass} value={value.tshirt.size ?? ""}
              onChange={(e) => onChange({ ...value, tshirt: { ...value.tshirt, size: e.target.value } })} />
          </FormField>
          <FormField label="Color">
            <input className={inputClass} value={value.tshirt.color ?? ""}
              onChange={(e) => onChange({ ...value, tshirt: { ...value.tshirt, color: e.target.value } })} />
          </FormField>
          <FormField label="Quantity *">
            <input type="number" className={inputClass} value={value.tshirt.quantity}
              onChange={(e) => onChange({ ...value, tshirt: { ...value.tshirt, quantity: parseInt(e.target.value, 10) || 1 } })} />
          </FormField>
          <FormField label="Printing type">
            <input className={inputClass} value={value.tshirt.printingType ?? ""}
              onChange={(e) => onChange({ ...value, tshirt: { ...value.tshirt, printingType: e.target.value } })} />
          </FormField>
          <FormField label="Design description" className="sm:col-span-2">
            <input className={inputClass} value={value.tshirt.designDescription ?? ""}
              onChange={(e) => onChange({ ...value, tshirt: { ...value.tshirt, designDescription: e.target.value } })} />
          </FormField>
          <FormField label="Printing cost">
            <input type="number" className={inputClass} value={value.tshirt.printingCost}
              onChange={(e) => onChange({ ...value, tshirt: { ...value.tshirt, printingCost: parseFloat(e.target.value) || 0 } })} />
          </FormField>
          <FormField label="Customer price *">
            <input type="number" className={inputClass} value={value.tshirt.customerPrice}
              onChange={(e) => onChange({ ...value, tshirt: { ...value.tshirt, customerPrice: parseFloat(e.target.value) || 0 }, price: e.target.value })} />
          </FormField>
        </div>
      )}

      {isWedding && (
        <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
          <FormField label="External material cost (wedding)">
            <input type="number" className={inputClass} value={value.externalMaterialCost}
              onChange={(e) => onChange({ ...value, externalMaterialCost: e.target.value })} />
          </FormField>
          <p className="mt-2 text-xs text-violet-700">
            Profit preview: {formatMoney(preview.grossProfit)} ({preview.profitMarginPercent}% margin)
          </p>
        </div>
      )}

      {isTailoring && (
        <div className="space-y-3 rounded-xl border border-slate-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Measurements</h3>
            {profiles.length > 0 && (
              <select
                className={selectClass + " w-auto"}
                value={value.measurementProfileId}
                onChange={(e) => {
                  const id = e.target.value;
                  const profile = profiles.find((p) => p.id === id);
                  onChange({
                    ...value,
                    measurementProfileId: id,
                    measurements: profile ? { ...profile.fields } : value.measurements,
                  });
                }}
              >
                <option value="">New measurements</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({new Date(p.recordedAt).toLocaleDateString("en-IN")})
                  </option>
                ))}
              </select>
            )}
          </div>
          <MeasurementForm
            value={value.measurements}
            onChange={(m) => onChange({ ...value, measurements: m })}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Material details" className="sm:col-span-2">
          <input className={inputClass} value={value.materialDetails}
            onChange={(e) => onChange({ ...value, materialDetails: e.target.value })} />
        </FormField>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={value.customerSuppliedMaterial}
            onChange={(e) => onChange({ ...value, customerSuppliedMaterial: e.target.checked })} />
          Customer supplied material
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={value.shopSuppliedMaterial}
            onChange={(e) => onChange({ ...value, shopSuppliedMaterial: e.target.checked })} />
          Shop supplied material
        </label>
        <FormField label="Notes" className="sm:col-span-2">
          <textarea className={inputClass + " h-20 py-2"} value={value.notes}
            onChange={(e) => onChange({ ...value, notes: e.target.value })} />
        </FormField>
      </div>

      <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
        <div className="flex justify-between"><span>Net price</span><strong>{formatMoney(preview.netPrice)}</strong></div>
        <div className="flex justify-between text-slate-600"><span>Advance</span><span>{formatMoney(preview.advance)}</span></div>
        <div className="flex justify-between"><span>Balance</span><strong className={preview.balance > 0 ? "text-rose-600" : ""}>{formatMoney(preview.balance)}</strong></div>
        {(isWedding || isTshirt) && (
          <div className="mt-1 flex justify-between text-emerald-700">
            <span>Est. profit</span><strong>{formatMoney(preview.grossProfit)}</strong>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={onSubmit}>Create Order</Button>
      </div>
    </div>
  );
}
