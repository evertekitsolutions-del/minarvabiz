"use client";

import * as React from "react";
import type { Sale, SaleReturn, ReturnReason, PaymentMethod } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { Modal } from "../forms/Modal";
import { FormField, inputClass, selectClass } from "../forms/FormField";
import { formatMoney } from "../customers/format";

export function ReturnsPanel({
  returns,
  sales,
  onCreate,
}: {
  returns: SaleReturn[];
  sales: Sale[];
  onCreate: (payload: {
    saleId: string;
    reason: ReturnReason;
    notes: string;
    refundMethod: PaymentMethod;
    items: Array<{
      saleItemId: string;
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      restock: boolean;
    }>;
  }) => { success: boolean; errors?: string[] };
}) {
  const [open, setOpen] = React.useState(false);
  const [saleId, setSaleId] = React.useState("");
  const [reason, setReason] = React.useState<ReturnReason>("customer_changed_mind");
  const [method, setMethod] = React.useState<PaymentMethod>("cash");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [qtyMap, setQtyMap] = React.useState<Record<string, number>>({});

  const sale = sales.find((s) => s.id === saleId);

  const columns: Column<SaleReturn>[] = [
    { key: "returnNumber", header: "Return #", render: (r) => <span className="font-medium">{r.returnNumber}</span> },
    { key: "invoiceNumber", header: "Invoice" },
    { key: "customerName", header: "Customer", render: (r) => r.customerName || "Walk-in" },
    { key: "totalRefund", header: "Refund", render: (r) => formatMoney(r.totalRefund) },
    { key: "reason", header: "Reason", render: (r) => r.reason.replace(/_/g, " ") },
    {
      key: "createdAt",
      header: "Date",
      render: (r) => new Date(r.createdAt).toLocaleString("en-IN"),
    },
  ];

  function submit() {
    if (!sale) {
      setError("Select a sale");
      return;
    }
    const items = sale.items
      .filter((i) => (qtyMap[i.id] ?? 0) > 0)
      .map((i) => ({
        saleItemId: i.id,
        productId: i.productId,
        productName: i.productName,
        quantity: qtyMap[i.id],
        unitPrice: i.unitPrice,
        restock: true,
      }));
    const result = onCreate({
      saleId: sale.id,
      reason,
      notes,
      refundMethod: method,
      items,
    });
    if (!result.success) {
      setError((result.errors || ["Failed"]).join("; "));
      return;
    }
    setOpen(false);
    setSaleId("");
    setQtyMap({});
    setError(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Returns & Refunds</h2>
          <p className="text-sm text-slate-500">{returns.length} returns</p>
        </div>
        <Button onClick={() => setOpen(true)}>+ New Return</Button>
      </div>
      <DataTable columns={columns} rows={returns} emptyMessage="No returns yet" />

      <Modal open={open} title="Process return" onClose={() => setOpen(false)} className="max-w-lg"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit}>Process refund</Button></>}>
        <div className="space-y-3">
          <FormField label="Original sale *">
            <select className={selectClass} value={saleId} onChange={(e) => { setSaleId(e.target.value); setQtyMap({}); }}>
              <option value="">Select invoice</option>
              {sales.map((s) => (
                <option key={s.id} value={s.id}>{s.invoiceNumber} — {formatMoney(s.total)}</option>
              ))}
            </select>
          </FormField>
          {sale && (
            <div className="space-y-2 rounded-xl border border-slate-100 p-3">
              {sale.items.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex-1">{i.productName} (sold {i.quantity})</span>
                  <input
                    type="number"
                    min={0}
                    max={i.quantity}
                    className="h-8 w-16 rounded border border-slate-200 px-2 text-center"
                    value={qtyMap[i.id] ?? 0}
                    onChange={(e) =>
                      setQtyMap({ ...qtyMap, [i.id]: Math.min(i.quantity, parseInt(e.target.value, 10) || 0) })
                    }
                  />
                </div>
              ))}
            </div>
          )}
          <FormField label="Reason">
            <select className={selectClass} value={reason} onChange={(e) => setReason(e.target.value as ReturnReason)}>
              <option value="defective">Defective</option>
              <option value="wrong_item">Wrong item</option>
              <option value="customer_changed_mind">Customer changed mind</option>
              <option value="size_issue">Size issue</option>
              <option value="other">Other</option>
            </select>
          </FormField>
          <FormField label="Refund method">
            <select className={selectClass} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="bank">Bank</option>
            </select>
          </FormField>
          <FormField label="Notes">
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
