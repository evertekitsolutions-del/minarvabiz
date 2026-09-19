"use client";

import * as React from "react";
import { PurchaseList, ProcurementPanel, Modal, Button, FormField, inputClass, selectClass } from "@minarvabiz/ui";
import { phase5Store, ordersStore, procurementStore, store, warehouseStore } from "@minarvabiz/business-logic";
import type { GoodsReceipt, Purchase, PurchaseOrder, Product, ServiceOrder, PaymentMethod, Supplier, WarehouseLocation } from "@minarvabiz/types";

function todayLocal(): string { const d = new Date(); const off = d.getTimezoneOffset() * 60000; return new Date(d.getTime() - off).toISOString().slice(0, 10); }

export default function PurchasesPage() {
  const [purchases, setPurchases] = React.useState<Purchase[]>([]);
  const [orders, setOrders] = React.useState<ServiceOrder[]>([]);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [purchaseOrders, setPurchaseOrders] = React.useState<PurchaseOrder[]>([]);
  const [goodsReceipts, setGoodsReceipts] = React.useState<GoodsReceipt[]>([]);
  const [warehouseLocations, setWarehouseLocations] = React.useState<WarehouseLocation[]>([]);
  const [open, setOpen] = React.useState(false);
  const [supplierOpen, setSupplierOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [supplierError, setSupplierError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    date: todayLocal(),
    description: "",
    amount: "",
    paidAmount: "",
    paymentMethod: "cash" as PaymentMethod,
    kind: "general" as "general" | "order_specific",
    orderId: "",
    supplierId: "",
  });
  const [supplierForm, setSupplierForm] = React.useState({ name: "", company: "", phone: "", category: "materials", notes: "" });

  const refresh = React.useCallback(() => {
    setPurchases(phase5Store.listPurchases());
    setOrders(ordersStore.listOrders());
    setSuppliers(phase5Store.listSuppliers());
    setProducts(store.listProducts());
    setPurchaseOrders(procurementStore.listPurchaseOrders());
    setGoodsReceipts(procurementStore.listGoodsReceipts());
    setWarehouseLocations(warehouseStore.listWarehouseLocations());
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  function savePurchase() {
    const result = phase5Store.createPurchase({
      date: form.date,
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
    setForm({ date: todayLocal(), description: "", amount: "", paidAmount: "", paymentMethod: "cash", kind: "general", orderId: "", supplierId: "" });
    refresh();
  }

  function saveSupplier() {
    if (!supplierForm.name.trim()) {
      setSupplierError("Supplier name is required");
      return;
    }
    try {
      phase5Store.createSupplier({
        name: supplierForm.name.trim(),
        company: supplierForm.company.trim() || null,
        phone: supplierForm.phone.trim() || null,
        category: supplierForm.category || "materials",
        notes: supplierForm.notes.trim() || null,
      });
      setSupplierOpen(false);
      setSupplierError(null);
      setSupplierForm({ name: "", company: "", phone: "", category: "materials", notes: "" });
      refresh();
    } catch (e) {
      setSupplierError(e instanceof Error ? e.message : "Unable to create supplier");
    }
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

      <ProcurementPanel
        purchaseOrders={purchaseOrders}
        goodsReceipts={goodsReceipts}
        suppliers={suppliers}
        products={products}
        warehouseLocations={warehouseLocations}
        onCreate={(payload) => {
          const result = procurementStore.createPurchaseOrder(payload);
          refresh();
          return {
            success: result.errors.length === 0 && Boolean(result.purchaseOrder),
            poNumber: result.purchaseOrder?.poNumber,
            errors: result.errors,
          };
        }}
        onApprove={(id) => {
          const result = procurementStore.approvePurchaseOrder(id);
          refresh();
          return { success: Boolean(result.purchaseOrder), error: result.error };
        }}
        onCancel={(id) => {
          const result = procurementStore.cancelPurchaseOrder(id);
          refresh();
          return { success: Boolean(result.purchaseOrder), error: result.error };
        }}
        onReceive={(payload) => {
          const result = procurementStore.receivePurchaseOrder(payload);
          refresh();
          return {
            success: result.errors.length === 0 && Boolean(result.goodsReceipt),
            grnNumber: result.goodsReceipt?.grnNumber,
            status: result.purchaseOrder?.status,
            errors: result.errors,
          };
        }}
      />

      <Modal open={open} title="Add Purchase" onClose={() => setOpen(false)} footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={savePurchase}>Save</Button></>}>
        <div className="space-y-3">
          <FormField label="Date"><input className={inputClass} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></FormField>
          <FormField label="Supplier">
            <div className="flex gap-2">
              <select className={selectClass} value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                <option value="">No supplier / direct purchase</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.company ? ` — ${s.company}` : ""}</option>)}
              </select>
              <Button type="button" size="sm" variant="outline" onClick={() => { setSupplierError(null); setSupplierOpen(true); }} aria-label="Add supplier">+</Button>
            </div>
          </FormField>
          <FormField label="Description *"><input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Thread, lining cloth, needles…" /></FormField>
          <FormField label="Amount *"><input type="number" min="0" step="0.01" className={inputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></FormField>
          <FormField label="Paid amount"><input type="number" min="0" step="0.01" className={inputClass} value={form.paidAmount} onChange={(e) => setForm({ ...form, paidAmount: e.target.value })} /></FormField>
          <FormField label="Payment method"><select className={selectClass} value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}><option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option><option value="bank">Bank</option></select></FormField>
          <FormField label="Kind"><select className={selectClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "general" | "order_specific" })}><option value="general">General (shop stock)</option><option value="order_specific">Order-specific</option></select></FormField>
          {form.kind === "order_specific" && <FormField label="Order *"><select className={selectClass} value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })}><option value="">Select order</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber} — {o.customerName}</option>)}</select></FormField>}
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>

      <Modal open={supplierOpen} title="Add Supplier" onClose={() => setSupplierOpen(false)} footer={<><Button variant="outline" onClick={() => setSupplierOpen(false)}>Cancel</Button><Button onClick={saveSupplier}>Save Supplier</Button></>}>
        <div className="space-y-3">
          <FormField label="Name *"><input className={inputClass} autoFocus value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} /></FormField>
          <FormField label="Company"><input className={inputClass} value={supplierForm.company} onChange={(e) => setSupplierForm({ ...supplierForm, company: e.target.value })} /></FormField>
          <FormField label="Phone"><input className={inputClass} value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} /></FormField>
          <FormField label="Category"><select className={selectClass} value={supplierForm.category} onChange={(e) => setSupplierForm({ ...supplierForm, category: e.target.value })}><option value="materials">Materials</option><option value="laundry">Laundry</option><option value="general">General</option></select></FormField>
          <FormField label="Notes"><textarea className={inputClass + " h-20 py-2"} value={supplierForm.notes} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })} /></FormField>
          {supplierError && <p className="text-sm text-rose-600">{supplierError}</p>}
        </div>
      </Modal>
    </div>
  );
}
