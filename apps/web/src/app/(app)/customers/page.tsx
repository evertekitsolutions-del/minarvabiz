"use client";

import * as React from "react";
import { CustomerList, CustomerProfile, Modal, Button, FormField, inputClass } from "@minarvabiz/ui";
import { store, phase6Store, assertLimit } from "@minarvabiz/business-logic";
import type { Customer, CustomerCrmProfile } from "@minarvabiz/types";
import { customerSchema } from "@minarvabiz/validation";

export default function CustomersPage() {
  const [list, setList] = React.useState<Customer[]>([]);
  const [profile, setProfile] = React.useState<CustomerCrmProfile | null>(null);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback((q?: string) => {
    setList(store.listCustomers(q));
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  function handleCreate() {
    const limit = assertLimit("customers");
    if (!limit.allowed) {
      setError(limit.reason ?? "Customer limit reached");
      return;
    }
    const parsed = customerSchema.safeParse({
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      notes: form.notes || null,
    });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    store.createCustomer(parsed.data);
    setOpen(false);
    setForm({ name: "", phone: "", email: "", address: "", notes: "" });
    setError(null);
    refresh();
  }

  return (
    <>
      <CustomerList
        customers={list}
        onAdd={() => setOpen(true)}
        onSearch={(q) => refresh(q)}
        onSelect={(c) => setProfile(phase6Store.getCustomerCrmProfile(c.id))}
      />
      {profile && (
        <div className="mt-6">
          <CustomerProfile profile={profile} onClose={() => setProfile(null)} />
        </div>
      )}
      <Modal
        open={open}
        title="Add Customer"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Save Customer</Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Name *">
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="Phone">
            <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </FormField>
          <FormField label="Email">
            <input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </FormField>
          <FormField label="Address">
            <input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </FormField>
          <FormField label="Notes">
            <textarea className={inputClass + " h-20 py-2"} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </FormField>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
