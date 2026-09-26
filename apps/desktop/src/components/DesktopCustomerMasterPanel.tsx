import * as React from "react";
import { Button, CustomerList, FormField, Modal, inputClass } from "@minarvabiz/ui";
import { store } from "@minarvabiz/business-logic";
import type { Customer } from "@minarvabiz/types";

type Props = {
  onAdd: () => void;
  onSelect: (customer: Customer) => void;
  onPersist: () => void | Promise<void>;
};

const emptyForm = { name: "", phone: "", whatsapp: "", email: "", address: "", birthday: "", notes: "" };

export function DesktopCustomerMasterPanel({ onAdd, onSelect, onPersist }: Props) {
  const [query, setQuery] = React.useState("");
  const [editTarget, setEditTarget] = React.useState<Customer | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<Customer | null>(null);
  const [archiveReason, setArchiveReason] = React.useState("");
  const [form, setForm] = React.useState(emptyForm);
  const [error, setError] = React.useState<string | null>(null);
  const [revision, setRevision] = React.useState(0);
  void revision;

  const customers = store.listCustomers(query);

  function openEdit(customer: Customer) {
    setEditTarget(customer);
    setForm({
      name: customer.name,
      phone: customer.phone || "",
      whatsapp: customer.whatsapp || "",
      email: customer.email || "",
      address: customer.address || "",
      birthday: customer.birthday ? String(customer.birthday).slice(0, 10) : "",
      notes: customer.notes || "",
    });
    setError(null);
  }

  async function saveEdit() {
    if (!editTarget) return;
    if (!form.name.trim()) { setError("Customer name is required"); return; }
    const updated = store.updateCustomer(editTarget.id, {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      birthday: form.birthday || null,
      notes: form.notes.trim() || null,
    });
    if (!updated) { setError("Customer not found"); return; }
    setEditTarget(null);
    setError(null);
    setRevision((value) => value + 1);
    await onPersist();
  }

  async function archiveCustomer() {
    if (!archiveTarget) return;
    const result = store.archiveCustomer(archiveTarget.id, archiveReason);
    if (result.error) { setError(result.error); return; }
    setArchiveTarget(null);
    setArchiveReason("");
    setError(null);
    setRevision((value) => value + 1);
    await onPersist();
  }

  return (
    <>
      <CustomerList
        customers={customers}
        onAdd={onAdd}
        onSearch={setQuery}
        onSelect={onSelect}
        onEdit={openEdit}
        onArchive={(customer) => { setArchiveTarget(customer); setArchiveReason(""); setError(null); }}
      />
      <Modal
        open={Boolean(editTarget)}
        title={editTarget ? `Edit Customer — ${editTarget.name}` : "Edit Customer"}
        onClose={() => { setEditTarget(null); setError(null); }}
        footer={<><Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button><Button onClick={() => void saveEdit()}>Save Changes</Button></>}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Name *"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
          <FormField label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
          <FormField label="WhatsApp"><input className={inputClass} value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></FormField>
          <FormField label="Email"><input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
          <FormField label="Address"><textarea className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></FormField>
          <FormField label="Birthday"><input className={inputClass} type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} /></FormField>
          <FormField label="Notes" className="sm:col-span-2"><textarea className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></FormField>
          {error && <p className="text-sm text-rose-600 sm:col-span-2">{error}</p>}
        </div>
      </Modal>
      <Modal
        open={Boolean(archiveTarget)}
        title={archiveTarget ? `Archive Customer — ${archiveTarget.name}` : "Archive Customer"}
        onClose={() => { setArchiveTarget(null); setArchiveReason(""); setError(null); }}
        footer={<><Button variant="outline" onClick={() => setArchiveTarget(null)}>Keep Customer</Button><Button disabled={archiveReason.trim().length < 3} onClick={() => void archiveCustomer()}>Archive Customer</Button></>}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">This is a soft archive. Historical invoices and audit records remain intact. Outstanding balances must be settled first.</p>
          <FormField label="Archive reason *"><textarea className={inputClass + " h-20 py-2"} value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} /></FormField>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
