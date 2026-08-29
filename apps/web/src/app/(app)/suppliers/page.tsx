"use client";

import * as React from "react";
import { SupplierList, Modal, Button, FormField, inputClass, selectClass } from "@minarvabiz/ui";
import { phase5Store } from "@minarvabiz/business-logic";
import type { Supplier } from "@minarvabiz/types";

export default function SuppliersPage() {
  const [list, setList] = React.useState<Supplier[]>([]);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "", company: "", phone: "", category: "materials", notes: "",
  });

  const refresh = React.useCallback((q?: string) => {
    setList(phase5Store.listSuppliers(q));
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  function save() {
    if (!form.name.trim()) return;
    phase5Store.createSupplier(form);
    setOpen(false);
    setForm({ name: "", company: "", phone: "", category: "materials", notes: "" });
    refresh();
  }

  return (
    <>
      <SupplierList suppliers={list} onAdd={() => setOpen(true)} onSearch={(q) => refresh(q)} />
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
          <FormField label="Category">
            <select className={selectClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="laundry">Laundry</option>
              <option value="materials">Materials</option>
              <option value="general">General</option>
            </select>
          </FormField>
        </div>
      </Modal>
    </>
  );
}
