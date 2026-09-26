"use client";

import * as React from "react";
import { CustomerList, CustomerProfile, Modal, Button, FormField, inputClass } from "@minarvabiz/ui";
import { store, phase6Store, assertLimit } from "@minarvabiz/business-logic";
import type { Customer, CustomerCrmProfile } from "@minarvabiz/types";
import { customerSchema } from "@minarvabiz/validation";

const emptyForm = { name: "", phone: "", email: "", address: "", notes: "" };

export default function CustomersPage() {
  const [list, setList] = React.useState<Customer[]>([]);
  const [profile, setProfile] = React.useState<CustomerCrmProfile | null>(null);
  const [open, setOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Customer | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<Customer | null>(null);
  const [archiveReason, setArchiveReason] = React.useState("");
  const [form, setForm] = React.useState(emptyForm);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback((q?: string) => setList(store.listCustomers(q)), []);
  React.useEffect(() => { refresh(); }, [refresh]);

  function openCreate() {
    setEditTarget(null); setForm(emptyForm); setError(null); setOpen(true);
  }
  function openEdit(customer: Customer) {
    setEditTarget(customer);
    setForm({ name: customer.name, phone: customer.phone || "", email: customer.email || "", address: customer.address || "", notes: customer.notes || "" });
    setError(null); setOpen(true);
  }
  function save() {
    const parsed = customerSchema.safeParse({
      name: form.name, phone: form.phone || null, email: form.email || null, address: form.address || null, notes: form.notes || null,
    });
    if (!parsed.success) { setError(parsed.error.errors[0]?.message ?? "Invalid input"); return; }
    try {
      if (editTarget) {
        if (!store.updateCustomer(editTarget.id, parsed.data)) throw new Error("Customer not found");
      } else {
        const limit = assertLimit("customers");
        if (!limit.allowed) throw new Error(limit.reason ?? "Customer limit reached");
        store.createCustomer(parsed.data);
      }
      setOpen(false); setEditTarget(null); setForm(emptyForm); setError(null); refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save customer"); }
  }
  function archive() {
    if (!archiveTarget) return;
    const result = store.archiveCustomer(archiveTarget.id, archiveReason);
    if (result.error) { setError(result.error); return; }
    setArchiveTarget(null); setArchiveReason(""); setError(null);
    if (profile?.customer.id === archiveTarget.id) setProfile(null);
    refresh();
  }

  return (
    <>
      <CustomerList customers={list} onAdd={openCreate} onSearch={refresh}
        onSelect={(c) => setProfile(phase6Store.getCustomerCrmProfile(c.id))}
        onEdit={openEdit} onArchive={(c) => { setArchiveTarget(c); setArchiveReason(""); setError(null); }} />
      {profile && <div className="mt-6"><CustomerProfile profile={profile} onClose={() => setProfile(null)} /></div>}
      <Modal open={open} title={editTarget ? "Edit Customer" : "Add Customer"} onClose={() => { setOpen(false); setEditTarget(null); setError(null); }}
        footer={<><Button variant="outline" onClick={() => { setOpen(false); setEditTarget(null); }}>Cancel</Button><Button onClick={save}>{editTarget ? "Save Changes" : "Save Customer"}</Button></>}>
        <div className="space-y-3">
          <FormField label="Name *"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
          <FormField label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
          <FormField label="Email"><input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
          <FormField label="Address"><input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></FormField>
          <FormField label="Notes"><textarea className={inputClass + " h-20 py-2"} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></FormField>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>
      <Modal open={Boolean(archiveTarget)} title={archiveTarget ? `Archive Customer — ${archiveTarget.name}` : "Archive Customer"}
        onClose={() => { setArchiveTarget(null); setArchiveReason(""); setError(null); }}
        footer={<><Button variant="outline" onClick={() => setArchiveTarget(null)}>Keep Customer</Button><Button disabled={archiveReason.trim().length < 3} onClick={archive}>Archive Customer</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">This is a soft archive. Historical invoices and audit records remain intact. Customers with an outstanding balance cannot be archived.</p>
          <FormField label="Archive reason *"><textarea className={inputClass + " h-20 py-2"} value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} /></FormField>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
