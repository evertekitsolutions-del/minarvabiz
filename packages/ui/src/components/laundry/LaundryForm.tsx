"use client";

import * as React from "react";
import type { Customer, Supplier } from "@minarvabiz/types";
import { Button } from "../Button";
import { FormField, inputClass, selectClass } from "../forms/FormField";
import { calculateLaundryProfit } from "@minarvabiz/business-logic";
import { formatMoney } from "../customers/format";

export function LaundryForm({
  mode,
  customers,
  suppliers,
  onSubmit,
  onCancel,
  error,
}: {
  mode: "outsourced" | "in_house_ironing";
  customers: Customer[];
  suppliers: Supplier[];
  onSubmit: (data: {
    customerId: string;
    garment: string;
    quantity: number;
    supplierId: string | null;
    supplierRate: number;
    customerRate: number;
    paidAmount: number;
    notes: string;
  }) => void;
  onCancel: () => void;
  error?: string | null;
}) {
  const [customerId, setCustomerId] = React.useState("");
  const [garment, setGarment] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [supplierId, setSupplierId] = React.useState("");
  const [supplierRate, setSupplierRate] = React.useState(mode === "outsourced" ? "100" : "0");
  const [customerRate, setCustomerRate] = React.useState("150");
  const [paidAmount, setPaidAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const preview = calculateLaundryProfit({
    customerRate: parseFloat(customerRate) || 0,
    supplierRate: mode === "in_house_ironing" ? 0 : parseFloat(supplierRate) || 0,
    quantity: parseInt(quantity, 10) || 1,
  });

  return (
    <div className="space-y-3">
      <FormField label="Customer *">
        <select className={selectClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Select</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </FormField>
      <FormField label="Garment">
        <input className={inputClass} value={garment} onChange={(e) => setGarment(e.target.value)} placeholder="Shirt, Saree…" />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Quantity *">
          <input type="number" className={inputClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </FormField>
        <FormField label="Customer rate *">
          <input type="number" className={inputClass} value={customerRate} onChange={(e) => setCustomerRate(e.target.value)} />
        </FormField>
      </div>
      {mode === "outsourced" && (
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Laundry supplier *">
            <select className={selectClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select</option>
              {suppliers.filter((s) => !s.category || s.category === "laundry").map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Supplier rate *">
            <input type="number" className={inputClass} value={supplierRate} onChange={(e) => setSupplierRate(e.target.value)} />
          </FormField>
        </div>
      )}
      <FormField label="Paid now">
        <input type="number" className={inputClass} value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
      </FormField>
      <FormField label="Notes">
        <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FormField>
      <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <div className="flex justify-between"><span>Customer total</span><strong>{formatMoney(preview.totalCustomerCharge)}</strong></div>
        {mode === "outsourced" && (
          <div className="flex justify-between"><span>Supplier cost</span><span>{formatMoney(preview.totalSupplierCost)}</span></div>
        )}
        <div className="flex justify-between"><span>Profit</span><strong>{formatMoney(preview.totalProfit)}</strong></div>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSubmit({
          customerId,
          garment,
          quantity: parseInt(quantity, 10) || 1,
          supplierId: supplierId || null,
          supplierRate: parseFloat(supplierRate) || 0,
          customerRate: parseFloat(customerRate) || 0,
          paidAmount: parseFloat(paidAmount) || 0,
          notes,
        })}>
          Save
        </Button>
      </div>
    </div>
  );
}
