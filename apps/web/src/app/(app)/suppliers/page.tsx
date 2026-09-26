"use client";

import * as React from "react";
import { SupplierList, Modal, Button, FormField, inputClass, selectClass } from "@minarvabiz/ui";
import { phase5Store } from "@minarvabiz/business-logic";
import type { PaymentMethod, Supplier } from "@minarvabiz/types";

function todayLocal(): string { const d = new Date(); const off = d.getTimezoneOffset() * 60000; return new Date(d.getTime() - off).toISOString().slice(0, 10); }
const emptyForm = { name: "", company: "", phone: "", email: "", address: "", category: "materials", openingBalance: "", notes: "" };

export default function SuppliersPage() {
  const [list, setList] = React.useState<Supplier[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Supplier | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<Supplier | null>(null);
  const [archiveReason, setArchiveReason] = React.useState("");
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [paymentSupplier, setPaymentSupplier] = React.useState<Supplier | null>(null);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [supplierError, setSupplierError] = React.useState<string | null>(null);
  const [paymentForm, setPaymentForm] = React.useState({ date: todayLocal(), amount: "", paymentMethod: "cash" as PaymentMethod, reference: "", notes: "" });
  const [form, setForm] = React.useState(emptyForm);

  const refresh = React.useCallback((q?: string) => setList(phase5Store.listSuppliers(q)), []);
  React.useEffect(() => { refresh(); }, [refresh]);

  function openCreate() { setEditTarget(null); setForm(emptyForm); setSupplierError(null); setOpen(true); }
  function openEdit(supplier: Supplier) {
    setEditTarget(supplier);
    setForm({ name: supplier.name, company: supplier.company || "", phone: supplier.phone || "", email: supplier.email || "", address: supplier.address || "", category: supplier.category || "general", openingBalance: String(supplier.openingBalance), notes: supplier.notes || "" });
    setSupplierError(null); setOpen(true);
  }
  function save() {
    if (!form.name.trim()) { setSupplierError("Supplier name is required"); return; }
    try {
      if (editTarget) {
        if (!phase5Store.updateSupplier(editTarget.id, { name: form.name.trim(), company: form.company.trim() || null, phone: form.phone.trim() || null, email: form.email.trim() || null, address: form.address.trim() || null, category: form.category || null, notes: form.notes.trim() || null })) throw new Error("Supplier not found");
      } else {
        phase5Store.createSupplier({ ...form, openingBalance: form.openingBalance.trim() ? Number(form.openingBalance) : 0 });
      }
      setOpen(false); setEditTarget(null); setSupplierError(null); setForm(emptyForm); refresh();
    } catch (error) { setSupplierError(error instanceof Error ? error.message : String(error)); }
  }
  function archive() {
    if (!archiveTarget) return;
    const result = phase5Store.archiveSupplier(archiveTarget.id, archiveReason);
    if (result.error) { setSupplierError(result.error); return; }
    setArchiveTarget(null); setArchiveReason(""); setSupplierError(null); refresh();
  }
  function openPayment(supplier: Supplier) {
    setPaymentSupplier(supplier); setPaymentError(null);
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
      <SupplierList suppliers={list} onAdd={openCreate} onSearch={refresh} onPay={openPayment} onEdit={openEdit}
        onArchive={(s) => { setArchiveTarget(s); setArchiveReason(""); setSupplierError(null); }} />
      <Modal open={open} title={editTarget ? "Edit Supplier" : "Add Supplier"} onClose={() => { setOpen(false); setEditTarget(null); setSupplierError(null); }}
        footer={<><Button variant="outline" onClick={() => { setOpen(false); setEditTarget(null); }}>Cancel</Button><Button onClick={save}>{editTarget ? "Save Changes" : "Save Supplier"}</Button></>}>
        <div className="space-y-3">
          <FormField label="Name *"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
          <FormField label="Company"><input className={inputClass} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></FormField>
          <FormField label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
          <FormField label="Email"><input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
          <FormField label="Address"><textarea className={inputClass + " h-auto py-2"} rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></FormField>
          <FormField label="Category"><select className={selectClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="laundry">Laundry</option><option value="materials">Materials</option><option value="general">General</option></select></FormField>
          <FormField label="Opening balance"><input className={inputClass} type="number" min="0" step="0.01" disabled={Boolean(editTarget)} value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} /><p className="mt-1 text-xs text-slate-500">{editTarget ? "Opening balance is an accounting source and cannot be edited here." : "Non-zero opening balances post to Accounts Payable and Opening Balance Equity."}</p></FormField>
          <FormField label="Notes"><textarea className={inputClass + " h-auto py-2"} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></FormField>
          {supplierError && <p className="text-sm text-rose-600">{supplierError}</p>}
        </div>
      </Modal>
      <Modal open={Boolean(archiveTarget)} title={archiveTarget ? `Archive Supplier — ${archiveTarget.name}` : "Archive Supplier"}
        onClose={() => { setArchiveTarget(null); setArchiveReason(""); setSupplierError(null); }}
        footer={<><Button variant="outline" onClick={() => setArchiveTarget(null)}>Keep Supplier</Button><Button disabled={archiveReason.trim().length < 3} onClick={archive}>Archive Supplier</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">This is a soft archive. Historical purchases, payments and audit records remain intact. Suppliers with outstanding payables cannot be archived.</p>
          <FormField label="Archive reason *"><textarea className={inputClass + " h-20 py-2"} value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} /></FormField>
          {supplierError && <p className="text-sm text-rose-600">{supplierError}</p>}
        </div>
      </Modal>
      <Modal open={paymentOpen} title="Record Supplier Payment" onClose={() => setPaymentOpen(false)} footer={<><Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button><Button onClick={savePayment}>Record Payment</Button></>}>
        <div className="space-y-3"><p className="text-sm text-slate-600">{paymentSupplier?.name} · Outstanding <strong>{paymentSupplier?.outstandingBalance.toFixed(2)}</strong></p><FormField label="Date"><input className={inputClass} type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} /></FormField><FormField label="Amount"><input className={inputClass} type="number" min="0" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} /></FormField><FormField label="Payment method"><select className={selectClass} value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value as PaymentMethod })}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option><option value="online">Online</option><option value="other">Other</option></select></FormField><FormField label="Reference"><input className={inputClass} value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} /></FormField><FormField label="Notes"><input className={inputClass} value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} /></FormField>{paymentError && <p className="text-sm text-rose-600">{paymentError}</p>}</div>
      </Modal>
    </>
  );
}
