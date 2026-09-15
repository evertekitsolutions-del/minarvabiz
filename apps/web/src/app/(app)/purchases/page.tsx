"use client";

import * as React from "react";
import { PurchaseList, Modal, Button, FormField, inputClass, selectClass } from "@minarvabiz/ui";
import { phase5Store, ordersStore } from "@minarvabiz/business-logic";
import type { Purchase, ServiceOrder, PaymentMethod } from "@minarvabiz/types";

export default function PurchasesPage() {
  const [purchases, setPurchases] = React.useState<Purchase[]>([]);
  const [orders, setOrders] = React.useState<ServiceOrder[]>([]);
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    description: "",
    amount: "",
    paidAmount: "",
    paymentMethod: "cash" as PaymentMethod,
    kind: "general" as "general" | "order_specific",
    orderId: "",
    supplierId: "",
  });

  const refresh = React.useCallback(() => {
    setPurchases(phase5Store.listPurchases());
    setOrders(ordersStore.listOrders());
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  function savePurchase() {
    const result = phase5Store.createPurchase({
      description: form.description.trim(),
      amount: parseFloat(form.amount) || 0,
      paidAmount: parseFloat(form.paidAmount) || 0,
      paymentMethod: form.paymentMethod,
      kind: form.kind,
      orderId: form.orderId || null,
      supplierId: form.supplierId || null,
      notes: null,
    });
    if (result.errors.length || !result.purchase) {
      setError(result.errors.join("; ") || "Unable to create purchase");
      return;
    }
    setOpen(false);
    setError(null);
    setForm({ description: "", amount: "", paidAmount: "", paymentMethod: "cash", kind: "general", orderId: "", supplierId: "" });
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Purchases</h1>
          <p className="mt-1 text-sm text-slate-500">Track supplier and order-specific purchases.</p>
        </div>
        <Button onClick={() => { setError(null); setOpen(true); }}>Add Purchase</Button>
      </div>

      <PurchaseList purchases={purchases} onAdd={() => { setError(null); setOpen(true); }} />

      <Modal open={open} title="Add Purchase" onClose={() => setOpen(false)} footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={savePurchase}>Save</Button></>}>
        <div className="space-y-3">
          <FormField label="Description *"><input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Thread, lining cloth, needles…" /></FormField>
          <FormField label="Amount *"><input type="number" min="0" step="0.01" className={inputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></FormField>
          <FormField label="Paid amount"><input type="number" min="0" step="0.01" className={inputClass} value={form.paidAmount} onChange={(e) => setForm({ ...form, paidAmount: e.target.value })} /></FormField>
          <FormField label="Payment method"><select className={selectClass} value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}><option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option><option value="bank">Bank</option></select></FormField>
          <FormField label="Kind"><select className={selectClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "general" | "order_specific" })}><option value="general">General (shop stock)</option><option value="order_specific">Order-specific</option></select></FormField>
          {form.kind === "order_specific" && <FormField label="Order *"><select className={selectClass} value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })}><option value="">Select order</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber} — {o.customerName}</option>)}</select></FormField>}
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
