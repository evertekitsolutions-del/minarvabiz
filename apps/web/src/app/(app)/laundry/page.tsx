"use client";

import * as React from "react";
import { LaundryList, LaundryForm, Modal, Button, FormField, inputClass, selectClass } from "@minarvabiz/ui";
import { store, phase5Store, assertLimit } from "@minarvabiz/business-logic";
import type { LaundryOrder, Customer, PaymentMethod, Supplier } from "@minarvabiz/types";
import { customerSchema } from "@minarvabiz/validation";

export default function LaundryPage() {
  const [orders, setOrders] = React.useState<LaundryOrder[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [query, setQuery] = React.useState("");
  const [mode, setMode] = React.useState<"outsourced" | "in_house_ironing" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [statusError, setStatusError] = React.useState<string | null>(null);
  const [customerOpen, setCustomerOpen] = React.useState(false);
  const [supplierOpen, setSupplierOpen] = React.useState(false);
  const [customerError, setCustomerError] = React.useState<string | null>(null);
  const [supplierError, setSupplierError] = React.useState<string | null>(null);
  const [customerForm, setCustomerForm] = React.useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [supplierForm, setSupplierForm] = React.useState({ name: "", company: "", phone: "", category: "laundry", notes: "" });

  const refresh = React.useCallback(() => {
    setOrders(phase5Store.listLaundryOrders({ query: query || undefined }));
    setCustomers(store.listCustomers());
    setSuppliers(phase5Store.listSuppliers());
  }, [query]);

  React.useEffect(() => { refresh(); }, [refresh]);

  function handleSubmit(data: {
    customerId: string;
    garment: string;
    quantity: number;
    supplierId: string | null;
    supplierRate: number;
    customerRate: number;
    paidAmount: number;
    paymentMethod: PaymentMethod;
    notes: string;
  }) {
    if (!mode) return;
    const result = phase5Store.createLaundryOrder({
      ...data,
      mode,
    });
    if (result.errors.length) {
      setError(result.errors.join("; "));
      return;
    }
    setMode(null);
    setError(null);
    refresh();
  }

  function handleStatusChange(order: LaundryOrder, status: LaundryOrder["status"]) {
    try {
      const result = phase5Store.updateLaundryStatus(order.id, status);
      if (!result.order) {
        setStatusError(result.error ?? "Unable to update laundry status");
        return;
      }
      setStatusError(null);
      refresh();
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : "Unable to update laundry status");
    }
  }

  function saveCustomer() {
    const limit = assertLimit("customers");
    if (!limit.allowed) { setCustomerError(limit.reason ?? "Customer limit reached"); return; }
    const parsed = customerSchema.safeParse({
      name: customerForm.name,
      phone: customerForm.phone || null,
      email: customerForm.email || null,
      address: customerForm.address || null,
      notes: customerForm.notes || null,
    });
    if (!parsed.success) { setCustomerError(parsed.error.errors[0]?.message ?? "Invalid input"); return; }
    try {
      store.createCustomer(parsed.data);
      setCustomerOpen(false);
      setCustomerError(null);
      setCustomerForm({ name: "", phone: "", email: "", address: "", notes: "" });
      refresh();
    } catch (e) {
      setCustomerError(e instanceof Error ? e.message : "Unable to create customer");
    }
  }

  function saveSupplier() {
    if (!supplierForm.name.trim()) { setSupplierError("Supplier name is required"); return; }
    try {
      phase5Store.createSupplier({
        name: supplierForm.name.trim(),
        company: supplierForm.company.trim() || null,
        phone: supplierForm.phone.trim() || null,
        category: supplierForm.category || "laundry",
        notes: supplierForm.notes.trim() || null,
      });
      setSupplierOpen(false);
      setSupplierError(null);
      setSupplierForm({ name: "", company: "", phone: "", category: "laundry", notes: "" });
      refresh();
    } catch (e) {
      setSupplierError(e instanceof Error ? e.message : "Unable to create supplier");
    }
  }

  return (
    <>
      {statusError && <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{statusError}</p>}
      <LaundryList
        orders={orders}
        onSearch={setQuery}
        onAddOutsourced={() => setMode("outsourced")}
        onAddIroning={() => setMode("in_house_ironing")}
        onStatusChange={handleStatusChange}
      />
      <Modal
        open={mode !== null}
        title={mode === "outsourced" ? "Outsourced Laundry" : "In-house Ironing"}
        onClose={() => setMode(null)}
        className="max-w-xl"
      >
        {mode && (
          <LaundryForm
            mode={mode}
            customers={customers}
            suppliers={suppliers}
            onSubmit={handleSubmit}
            onCancel={() => setMode(null)}
            onAddCustomer={() => { setCustomerError(null); setCustomerOpen(true); }}
            onAddSupplier={() => { setSupplierError(null); setSupplierOpen(true); }}
            error={error}
          />
        )}
      </Modal>

      <Modal
        open={customerOpen}
        title="Add Customer"
        onClose={() => setCustomerOpen(false)}
        footer={<><Button variant="outline" onClick={() => setCustomerOpen(false)}>Cancel</Button><Button onClick={saveCustomer}>Save Customer</Button></>}
      >
        <div className="space-y-3">
          <FormField label="Name *"><input className={inputClass} autoFocus value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} /></FormField>
          <FormField label="Phone"><input className={inputClass} value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} /></FormField>
          <FormField label="Email"><input className={inputClass} type="email" value={customerForm.email} onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })} /></FormField>
          <FormField label="Address"><input className={inputClass} value={customerForm.address} onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })} /></FormField>
          <FormField label="Notes"><textarea className={inputClass + " h-20 py-2"} value={customerForm.notes} onChange={(e) => setCustomerForm({ ...customerForm, notes: e.target.value })} /></FormField>
          {customerError && <p className="text-sm text-rose-600">{customerError}</p>}
        </div>
      </Modal>

      <Modal
        open={supplierOpen}
        title="Add Supplier"
        onClose={() => setSupplierOpen(false)}
        footer={<><Button variant="outline" onClick={() => setSupplierOpen(false)}>Cancel</Button><Button onClick={saveSupplier}>Save Supplier</Button></>}
      >
        <div className="space-y-3">
          <FormField label="Name *"><input className={inputClass} autoFocus value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} /></FormField>
          <FormField label="Company"><input className={inputClass} value={supplierForm.company} onChange={(e) => setSupplierForm({ ...supplierForm, company: e.target.value })} /></FormField>
          <FormField label="Phone"><input className={inputClass} value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} /></FormField>
          <FormField label="Category"><select className={selectClass} value={supplierForm.category} onChange={(e) => setSupplierForm({ ...supplierForm, category: e.target.value })}><option value="laundry">Laundry</option><option value="materials">Materials</option><option value="general">General</option></select></FormField>
          <FormField label="Notes"><textarea className={inputClass + " h-20 py-2"} value={supplierForm.notes} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })} /></FormField>
          {supplierError && <p className="text-sm text-rose-600">{supplierError}</p>}
        </div>
      </Modal>
    </>
  );
}
