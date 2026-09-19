"use client";

import * as React from "react";
import { SupplierList, Modal, Button, FormField, inputClass, selectClass } from "@minarvabiz/ui";
import { phase5Store } from "@minarvabiz/business-logic";
import type { PaymentMethod, Supplier } from "@minarvabiz/types";

function todayLocal(): string { const d = new Date(); const off = d.getTimezoneOffset() * 60000; return new Date(d.getTime() - off).toISOString().slice(0, 10); }

export default function SuppliersPage() {
  const [list, setList] = React.useState<Supplier[]>([]);
  const [open, setOpen] = React.useState(false);
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [paymentSupplier, setPaymentSupplier] = React.useState<Supplier | null>(null);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [paymentForm, setPaymentForm] = React.useState({ date: todayLocal(), amount: "", paymentMethod: "cash" as PaymentMethod, reference: "", notes: "" });
  const [form, setForm] = React.useState({
    name: "", company: "", phone: "", email: "", address: "", category: "materials", openingBalance: "", notes: "",
  });

  const refresh = React.useCallback((q?: string) => {
    setList(phase5Store.listSuppliers(q));
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  function save() {
    if (!form.name.trim()) return;
    phase5Store.createSupplier({ ...form, openingBalance: parseFloat(form.openingBalance) || 0 });
    setOpen(false);
    setForm({ name: "", company: "", phone: "", email: "", address: "", category: "materials", openingBalance: "", notes: "" });
    refresh();
  }

  function openPayment(supplier: Supplier) {
    setPaymentSupplier(supplier);
    setPaymentError(null);
    setPaymentForm({ date: todayLocal(), amount: String(supplier.outstandingBalance), paymentMethod: "cash", reference: "", notes: "" });
    setPaymentOpen(true);
  }

  function savePayment() {
    if (!paymentSupplier) return;
    const result = phase5Store.recordSupplierPayment({ supplierId: paymentSupplier.id, amount: parseFloat(paymentForm.amount) || 0, paymentMethod: paymentForm.paymentMethod, date: paymentForm.date, reference: paymentForm.reference || null, notes: paymentForm.notes || null });
    if (result.errors.length) { setPaymentError(result.errors.join("; ")); return; }
    setPaymentOpen(false); setPaymentError(null); refresh();
  }

  return (
    <>
      <SupplierList suppliers={list} onAdd={() => setOpen(true)} onSearch={(q) => refresh(q)} onPay={openPayment} />
      <Modal open={open} title="Add Supplier" onClose={() => setOpen(false)}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button></>}>
        <div className="space-y-3">
          <FormField label="Name *">
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="Company">
            <input className={inputClass} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </FormField>
          <FormField label="Phone">
            <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </FormField>
          <FormField label="Email">
            <input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </FormField>
          <FormField label="Address">
            <textarea className={inputClass + " h-auto py-2"} rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </FormField>
          <FormField label="Category">
            <select className={selectClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="laundry">Laundry</option>
              <option value="materials">Materials</option>
              <option value="general">General</option>
            </select>
          </FormField>
          <FormField label="Opening balance">
            <input className={inputClass} type="number" min="0" step="0.01" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} />
          </FormField>
          <FormField label="Notes">
            <textarea className={inputClass + " h-auto py-2"} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </FormField>
        </div>
      </Modal>
      <Modal open={paymentOpen} title="Record Supplier Payment" onClose={() => setPaymentOpen(false)} footer={<><Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button><Button onClick={savePayment}>Record Payment</Button></>}>
        <div className="space-y-3"><p className="text-sm text-slate-600">{paymentSupplier?.name} · Outstanding <strong>{paymentSupplier?.outstandingBalance.toFixed(2)}</strong></p><FormField label="Date"><input className={inputClass} type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} /></FormField><FormField label="Amount"><input className={inputClass} type="number" min="0" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} /></FormField><FormField label="Payment method"><select className={selectClass} value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value as PaymentMethod })}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option><option value="online">Online</option><option value="other">Other</option></select></FormField><FormField label="Reference"><input className={inputClass} value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} /></FormField><FormField label="Notes"><input className={inputClass} value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} /></FormField>{paymentError && <p className="text-sm text-rose-600">{paymentError}</p>}</div>
      </Modal>
    </>
  );
}
