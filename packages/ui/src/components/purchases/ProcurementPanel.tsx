"use client";

import * as React from "react";
import type {
  GoodsReceipt,
  PaymentMethod,
  Product,
  PurchaseInvoice,
  PurchaseOrder,
  Supplier,
  SupplierPayableAging,
  WarehouseLocation,
} from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { FormField, inputClass, selectClass } from "../forms/FormField";
import { Modal } from "../forms/Modal";
import { formatMoney } from "../customers/format";

type DraftLine = {
  productId: string;
  description: string;
  quantity: string;
  unitCost: string;
  taxRate: string;
};

type InvoiceableLine = {
  purchaseOrderLineId: string;
  description: string;
  productId?: string | null;
  receivedQuantity: number;
  invoicedQuantity: number;
  invoiceableQuantity: number;
  unitCost: number;
  taxRate: number;
};

export function ProcurementPanel({
  purchaseOrders,
  goodsReceipts,
  purchaseInvoices,
  payableAging,
  suppliers,
  products,
  warehouseLocations = [],
  onCreate,
  onUpdate,
  onApprove,
  onCancel,
  onReceive,
  getInvoiceableLines,
  onCreateInvoice,
  onUpdateInvoice,
  onPostInvoice,
  onPayInvoice,
  onCancelInvoice,
}: {
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceipt[];
  purchaseInvoices: PurchaseInvoice[];
  payableAging: SupplierPayableAging[];
  suppliers: Supplier[];
  products: Product[];
  warehouseLocations?: WarehouseLocation[];
  onCreate: (payload: {
    supplierId: string;
    expectedDeliveryDate?: string | null;
    lines: Array<{ productId?: string | null; description: string; quantity: number; unitCost: number; taxRate: number }>;
    notes?: string | null;
  }) => { success: boolean; poNumber?: string; errors?: string[] };
  onUpdate: (id: string, payload: {
    supplierId: string;
    expectedDeliveryDate?: string | null;
    lines: Array<{ productId?: string | null; description: string; quantity: number; unitCost: number; taxRate: number }>;
    notes?: string | null;
  }) => { success: boolean; poNumber?: string; errors?: string[] };
  onApprove: (id: string) => { success: boolean; error?: string };
  onCancel: (id: string, reason: string) => { success: boolean; error?: string };
  onReceive: (payload: {
    purchaseOrderId: string;
    lines: Array<{ purchaseOrderLineId: string; quantity: number; warehouseLocationId?: string | null }>;
    notes?: string | null;
  }) => { success: boolean; grnNumber?: string; status?: string; errors?: string[] };
  getInvoiceableLines: (purchaseOrderId: string, excludeInvoiceId?: string) => InvoiceableLine[];
  onCreateInvoice: (payload: {
    purchaseOrderId: string;
    supplierInvoiceNumber?: string | null;
    dueDate?: string | null;
    lines: Array<{ purchaseOrderLineId: string; quantity: number }>;
    notes?: string | null;
  }) => { success: boolean; invoiceNumber?: string; errors?: string[] };
  onUpdateInvoice: (id: string, payload: {
    supplierInvoiceNumber?: string | null;
    invoiceDate?: string;
    dueDate?: string | null;
    lines: Array<{ purchaseOrderLineId: string; quantity: number; unitCost?: number; taxRate?: number }>;
    notes?: string | null;
  }) => { success: boolean; invoiceNumber?: string; errors?: string[] };
  onPostInvoice: (id: string) => { success: boolean; error?: string };
  onPayInvoice: (payload: {
    purchaseInvoiceId: string;
    amount: number;
    paymentMethod: PaymentMethod;
  }) => { success: boolean; error?: string };
  onCancelInvoice: (id: string, reason: string) => { success: boolean; error?: string };
}) {
  const [supplierId, setSupplierId] = React.useState("");
  const [expectedDate, setExpectedDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [draft, setDraft] = React.useState<DraftLine>({ productId: "", description: "", quantity: "1", unitCost: "", taxRate: "0" });
  const [lines, setLines] = React.useState<Array<{ productId?: string | null; description: string; quantity: number; unitCost: number; taxRate: number }>>([]);
  const [message, setMessage] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [receiveOrderId, setReceiveOrderId] = React.useState("");
  const [receiveQty, setReceiveQty] = React.useState<Record<string, string>>({});
  const [receiveLocation, setReceiveLocation] = React.useState<Record<string, string>>({});
  const [receiveNotes, setReceiveNotes] = React.useState("");

  const [invoiceOrderId, setInvoiceOrderId] = React.useState("");
  const [invoiceQty, setInvoiceQty] = React.useState<Record<string, string>>({});
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = React.useState("");
  const [invoiceDueDate, setInvoiceDueDate] = React.useState("");
  const [invoiceNotes, setInvoiceNotes] = React.useState("");

  const [payInvoiceId, setPayInvoiceId] = React.useState("");
  const [payAmount, setPayAmount] = React.useState("");
  const [payMethod, setPayMethod] = React.useState<PaymentMethod>("bank");

  const [poQuery, setPoQuery] = React.useState("");
  const [poSupplierId, setPoSupplierId] = React.useState("");
  const [poStatus, setPoStatus] = React.useState("");
  const [invoiceQuery, setInvoiceQuery] = React.useState("");
  const [invoiceSupplierId, setInvoiceSupplierId] = React.useState("");
  const [invoiceStatus, setInvoiceStatus] = React.useState("");
  const [invoiceDateFrom, setInvoiceDateFrom] = React.useState("");
  const [invoiceDateTo, setInvoiceDateTo] = React.useState("");
  const [cancelPoId, setCancelPoId] = React.useState("");
  const [cancelPoReason, setCancelPoReason] = React.useState("");
  const [cancelInvoiceId, setCancelInvoiceId] = React.useState("");
  const [cancelInvoiceReason, setCancelInvoiceReason] = React.useState("");

  const [editPoId, setEditPoId] = React.useState("");
  const [editPoSupplierId, setEditPoSupplierId] = React.useState("");
  const [editPoExpectedDate, setEditPoExpectedDate] = React.useState("");
  const [editPoNotes, setEditPoNotes] = React.useState("");
  const [editPoLines, setEditPoLines] = React.useState<DraftLine[]>([]);
  const [editInvoiceId, setEditInvoiceId] = React.useState("");
  const [editSupplierInvoiceNumber, setEditSupplierInvoiceNumber] = React.useState("");
  const [editInvoiceDate, setEditInvoiceDate] = React.useState("");
  const [editInvoiceDueDate, setEditInvoiceDueDate] = React.useState("");
  const [editInvoiceNotes, setEditInvoiceNotes] = React.useState("");
  const [editInvoiceLines, setEditInvoiceLines] = React.useState<Array<InvoiceableLine & { quantity: string; editUnitCost: string; editTaxRate: string }>>([]);

  const receiveOrder = purchaseOrders.find((po) => po.id === receiveOrderId) ?? null;
  const invoiceOrder = purchaseOrders.find((po) => po.id === invoiceOrderId) ?? null;
  const invoiceableLines = invoiceOrder ? getInvoiceableLines(invoiceOrder.id) : [];
  const payInvoice = purchaseInvoices.find((invoice) => invoice.id === payInvoiceId) ?? null;

  const cancelPo = purchaseOrders.find((po) => po.id === cancelPoId) ?? null;
  const cancelInvoice = purchaseInvoices.find((invoice) => invoice.id === cancelInvoiceId) ?? null;

  const editPo = purchaseOrders.find((po) => po.id === editPoId) ?? null;
  const editInvoice = purchaseInvoices.find((invoice) => invoice.id === editInvoiceId) ?? null;
  const filteredPurchaseOrders = React.useMemo(() => {
    const q = poQuery.trim().toLowerCase();
    return purchaseOrders.filter((po) => {
      if (poSupplierId && po.supplierId !== poSupplierId) return false;
      if (poStatus && po.status !== poStatus) return false;
      if (!q) return true;
      return [po.poNumber, po.supplierName || "", po.notes || "", ...po.lines.map((line) => line.description)]
        .some((value) => value.toLowerCase().includes(q));
    });
  }, [purchaseOrders, poSupplierId, poStatus, poQuery]);
  const filteredPurchaseInvoices = React.useMemo(() => {
    const q = invoiceQuery.trim().toLowerCase();
    return purchaseInvoices.filter((invoice) => {
      if (invoiceSupplierId && invoice.supplierId !== invoiceSupplierId) return false;
      if (invoiceStatus && invoice.status !== invoiceStatus) return false;
      const key = String(invoice.invoiceDate || "").slice(0, 10);
      if (invoiceDateFrom && key < invoiceDateFrom) return false;
      if (invoiceDateTo && key > invoiceDateTo) return false;
      if (!q) return true;
      return [invoice.invoiceNumber, invoice.supplierInvoiceNumber || "", invoice.supplierName || "", invoice.poNumber || "", invoice.notes || ""]
        .some((value) => value.toLowerCase().includes(q));
    });
  }, [purchaseInvoices, invoiceSupplierId, invoiceStatus, invoiceDateFrom, invoiceDateTo, invoiceQuery]);

  function chooseProduct(id: string) {
    const product = products.find((p) => p.id === id);
    setDraft((current) => ({
      ...current,
      productId: id,
      description: product?.name || current.description,
      unitCost: product ? String(product.costPrice) : current.unitCost,
    }));
  }

  function addLine() {
    const description = draft.description.trim();
    const quantity = Number(draft.quantity);
    const unitCost = Number(draft.unitCost);
    const taxRate = Math.max(0, Number(draft.taxRate) || 0);
    if (!description) { setMessage({ type: "err", text: "Enter a line description or select a product." }); return; }
    if (!Number.isFinite(quantity) || quantity <= 0) { setMessage({ type: "err", text: "Quantity must be greater than zero." }); return; }
    if (!Number.isFinite(unitCost) || unitCost < 0) { setMessage({ type: "err", text: "Unit cost cannot be negative." }); return; }
    setLines((current) => [...current, { productId: draft.productId || null, description, quantity, unitCost, taxRate }]);
    setDraft({ productId: "", description: "", quantity: "1", unitCost: "", taxRate: "0" });
    setMessage(null);
  }

  const totals = React.useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const line of lines) {
      const base = line.quantity * line.unitCost;
      subtotal += base;
      tax += base * line.taxRate / 100;
    }
    return { subtotal, tax, total: subtotal + tax };
  }, [lines]);

  function createOrder() {
    if (!supplierId) { setMessage({ type: "err", text: "Select a supplier." }); return; }
    const result = onCreate({ supplierId, expectedDeliveryDate: expectedDate || null, lines, notes: notes.trim() || null });
    if (!result.success) { setMessage({ type: "err", text: (result.errors || ["Unable to create purchase order"]).join("; ") }); return; }
    setMessage({ type: "ok", text: `${result.poNumber || "Purchase order"} created.` });
    setSupplierId(""); setExpectedDate(""); setNotes(""); setLines([]);
  }

  function openPoEditor(po: PurchaseOrder) {
    if (po.status !== "draft") return;
    setEditPoId(po.id);
    setEditPoSupplierId(po.supplierId);
    setEditPoExpectedDate(po.expectedDeliveryDate ? String(po.expectedDeliveryDate).slice(0, 10) : "");
    setEditPoNotes(po.notes || "");
    setEditPoLines(po.lines.map((line) => ({
      productId: line.productId || "",
      description: line.description,
      quantity: String(line.orderedQuantity),
      unitCost: String(line.unitCost),
      taxRate: String(line.taxRate),
    })));
    setMessage(null);
  }

  function savePoEdit() {
    if (!editPo) return;
    const linesForSave = editPoLines.map((line) => ({
      productId: line.productId || null,
      description: line.description.trim(),
      quantity: Number(line.quantity),
      unitCost: Number(line.unitCost),
      taxRate: Number(line.taxRate),
    }));
    const result = onUpdate(editPo.id, {
      supplierId: editPoSupplierId,
      expectedDeliveryDate: editPoExpectedDate || null,
      lines: linesForSave,
      notes: editPoNotes.trim() || null,
    });
    if (!result.success) {
      setMessage({ type: "err", text: (result.errors || ["Unable to update purchase order"]).join("; ") });
      return;
    }
    setMessage({ type: "ok", text: `${result.poNumber || editPo.poNumber} updated.` });
    setEditPoId("");
  }

  function openInvoiceEditor(invoice: PurchaseInvoice) {
    if (invoice.status !== "draft" || !invoice.purchaseOrderId) return;
    const available = getInvoiceableLines(invoice.purchaseOrderId, invoice.id);
    setEditInvoiceId(invoice.id);
    setEditSupplierInvoiceNumber(invoice.supplierInvoiceNumber || "");
    setEditInvoiceDate(String(invoice.invoiceDate || "").slice(0, 10));
    setEditInvoiceDueDate(invoice.dueDate ? String(invoice.dueDate).slice(0, 10) : "");
    setEditInvoiceNotes(invoice.notes || "");
    setEditInvoiceLines(available.map((line) => {
      const existing = invoice.lines.find((item) => item.purchaseOrderLineId === line.purchaseOrderLineId);
      return {
        ...line,
        quantity: existing ? String(existing.invoicedQuantity) : "0",
        editUnitCost: String(existing?.unitCost ?? line.unitCost),
        editTaxRate: String(existing?.taxRate ?? line.taxRate),
      };
    }));
    setMessage(null);
  }

  function saveInvoiceEdit() {
    if (!editInvoice) return;
    const linesForSave = editInvoiceLines
      .map((line) => ({
        purchaseOrderLineId: line.purchaseOrderLineId,
        quantity: Number(line.quantity),
        unitCost: Number(line.editUnitCost),
        taxRate: Number(line.editTaxRate),
      }))
      .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);
    const result = onUpdateInvoice(editInvoice.id, {
      supplierInvoiceNumber: editSupplierInvoiceNumber.trim() || null,
      invoiceDate: editInvoiceDate || undefined,
      dueDate: editInvoiceDueDate || null,
      lines: linesForSave,
      notes: editInvoiceNotes.trim() || null,
    });
    if (!result.success) {
      setMessage({ type: "err", text: (result.errors || ["Unable to update supplier invoice"]).join("; ") });
      return;
    }
    setMessage({ type: "ok", text: `${result.invoiceNumber || editInvoice.invoiceNumber} updated.` });
    setEditInvoiceId("");
  }

  function openReceipt(po: PurchaseOrder) {
    const quantities: Record<string, string> = {};
    for (const line of po.lines) {
      const remaining = Math.max(0, line.orderedQuantity - line.receivedQuantity);
      quantities[line.id] = remaining > 0 ? String(remaining) : "0";
    }
    setReceiveOrderId(po.id);
    setReceiveQty(quantities);
    setReceiveLocation({});
    setReceiveNotes("");
    setMessage(null);
  }

  function submitReceipt() {
    if (!receiveOrder) return;
    const receiptLines = receiveOrder.lines
      .map((line) => ({
        purchaseOrderLineId: line.id,
        quantity: Number(receiveQty[line.id] || 0),
        warehouseLocationId: receiveLocation[line.id] || null,
      }))
      .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);
    const result = onReceive({ purchaseOrderId: receiveOrder.id, lines: receiptLines, notes: receiveNotes.trim() || null });
    if (!result.success) {
      setMessage({ type: "err", text: (result.errors || ["Unable to post goods receipt"]).join("; ") });
      return;
    }
    setMessage({ type: "ok", text: `${result.grnNumber || "Goods receipt"} posted · ${result.status || "received"}.` });
    setReceiveOrderId(""); setReceiveQty({}); setReceiveLocation({}); setReceiveNotes("");
  }

  function openInvoice(po: PurchaseOrder) {
    const available = getInvoiceableLines(po.id);
    const quantities: Record<string, string> = {};
    for (const line of available) quantities[line.purchaseOrderLineId] = line.invoiceableQuantity > 0 ? String(line.invoiceableQuantity) : "0";
    setInvoiceOrderId(po.id);
    setInvoiceQty(quantities);
    setSupplierInvoiceNumber("");
    setInvoiceDueDate("");
    setInvoiceNotes("");
    setMessage(null);
  }

  function submitInvoice() {
    if (!invoiceOrder) return;
    const invoiceLines = invoiceableLines
      .map((line) => ({ purchaseOrderLineId: line.purchaseOrderLineId, quantity: Number(invoiceQty[line.purchaseOrderLineId] || 0) }))
      .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);
    const result = onCreateInvoice({
      purchaseOrderId: invoiceOrder.id,
      supplierInvoiceNumber: supplierInvoiceNumber.trim() || null,
      dueDate: invoiceDueDate || null,
      lines: invoiceLines,
      notes: invoiceNotes.trim() || null,
    });
    if (!result.success) {
      setMessage({ type: "err", text: (result.errors || ["Unable to create supplier invoice"]).join("; ") });
      return;
    }
    setMessage({ type: "ok", text: `${result.invoiceNumber || "Supplier invoice"} created as draft.` });
    setInvoiceOrderId(""); setInvoiceQty({}); setSupplierInvoiceNumber(""); setInvoiceDueDate(""); setInvoiceNotes("");
  }

  function submitPayment() {
    if (!payInvoice) return;
    const result = onPayInvoice({
      purchaseInvoiceId: payInvoice.id,
      amount: Number(payAmount),
      paymentMethod: payMethod,
    });
    if (!result.success) {
      setMessage({ type: "err", text: result.error || "Unable to record supplier invoice payment." });
      return;
    }
    setMessage({ type: "ok", text: `Payment recorded for ${payInvoice.invoiceNumber}.` });
    setPayInvoiceId(""); setPayAmount("");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Purchase Order</CardTitle>
          <p className="text-xs text-slate-500">Plan and approve procurement before stock or accounts are affected.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <FormField label="Purchase order supplier *">
              <select className={selectClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.company ? ` — ${supplier.company}` : ""}</option>)}
              </select>
            </FormField>
            <FormField label="Expected delivery">
              <input className={inputClass} type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </FormField>
            <FormField label="Notes">
              <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Supplier reference / terms" />
            </FormField>
          </div>

          <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[1.2fr_1.4fr_.55fr_.75fr_.55fr_auto]">
            <select aria-label="Purchase order product" className={selectClass} value={draft.productId} onChange={(e) => chooseProduct(e.target.value)}>
              <option value="">Product (optional)</option>
              {products.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` · ${p.sku}` : ""}</option>)}
            </select>
            <input className={inputClass} placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <input className={inputClass} type="number" min="0.001" step="0.001" placeholder="Qty" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} />
            <input className={inputClass} type="number" min="0" step="0.01" placeholder="Unit cost" value={draft.unitCost} onChange={(e) => setDraft({ ...draft, unitCost: e.target.value })} />
            <input className={inputClass} type="number" min="0" step="0.01" placeholder="Tax %" value={draft.taxRate} onChange={(e) => setDraft({ ...draft, taxRate: e.target.value })} />
            <Button type="button" variant="outline" onClick={addLine}>Add line</Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2 text-right">Tax</th><th className="px-3 py-2 text-right">Total</th><th></th></tr></thead>
              <tbody>
                {!lines.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No lines added</td></tr>}
                {lines.map((line, index) => {
                  const base = line.quantity * line.unitCost;
                  const total = base + base * line.taxRate / 100;
                  return <tr key={index} className="border-t border-slate-100"><td className="px-3 py-2">{line.description}</td><td className="px-3 py-2 text-right">{line.quantity}</td><td className="px-3 py-2 text-right">{formatMoney(line.unitCost)}</td><td className="px-3 py-2 text-right">{line.taxRate}%</td><td className="px-3 py-2 text-right font-medium">{formatMoney(total)}</td><td className="px-3 py-2 text-right"><button type="button" className="text-xs font-medium text-rose-600" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>Remove</button></td></tr>;
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-600">Subtotal {formatMoney(totals.subtotal)} · Tax {formatMoney(totals.tax)} · <strong className="text-slate-900">Total {formatMoney(totals.total)}</strong></div>
            <Button onClick={createOrder} disabled={!lines.length || !supplierId}>Create Purchase Order</Button>
          </div>
          {message && <p className={`text-sm ${message.type === "ok" ? "text-emerald-600" : "text-rose-600"}`}>{message.text}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Purchase Orders</CardTitle>
          <p className="text-xs text-slate-500">{filteredPurchaseOrders.length} of {purchaseOrders.length} records</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-4">
            <label className="text-xs font-medium text-slate-600 md:col-span-2">
              Search PO, supplier or item
              <input className={inputClass + " mt-1"} value={poQuery} onChange={(e) => setPoQuery(e.target.value)} placeholder="Search…" />
            </label>
            <label className="text-xs font-medium text-slate-600">
              PO supplier filter
              <select className={selectClass + " mt-1"} value={poSupplierId} onChange={(e) => setPoSupplierId(e.target.value)}>
                <option value="">All suppliers</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              Status
              <select className={selectClass + " mt-1"} value={poStatus} onChange={(e) => setPoStatus(e.target.value)}>
                <option value="">All statuses</option>
                {["draft", "approved", "partially_received", "received", "cancelled"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
              </select>
            </label>
          </div>
          {!filteredPurchaseOrders.length && <p className="py-4 text-center text-sm text-slate-400">No purchase orders match the selected filters</p>}
          {filteredPurchaseOrders.map((po) => {
            const ordered = po.lines.reduce((sum, line) => sum + line.orderedQuantity, 0);
            const received = po.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
            const invoiceable = getInvoiceableLines(po.id).reduce((sum, line) => sum + line.invoiceableQuantity, 0);
            return (
              <div key={po.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{po.poNumber} · {po.supplierName || po.supplierId}</div>
                  <div className="mt-1 text-xs text-slate-500">{po.status.replace(/_/g, " ")} · {po.lines.length} line(s) · Received {received}/{ordered} · Expected {po.expectedDeliveryDate || "—"}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{formatMoney(po.total)}</span>
                  {po.status === "draft" && <Button size="sm" variant="outline" onClick={() => openPoEditor(po)}>Edit</Button>}
                  {po.status === "draft" && <Button size="sm" onClick={() => { const r = onApprove(po.id); setMessage(r.success ? { type: "ok", text: `${po.poNumber} approved.` } : { type: "err", text: r.error || "Approval failed" }); }}>Approve</Button>}
                  {(po.status === "approved" || po.status === "partially_received") && <Button size="sm" onClick={() => openReceipt(po)}>Receive goods</Button>}
                  {invoiceable > 0 && <Button size="sm" variant="outline" onClick={() => openInvoice(po)}>Create supplier invoice</Button>}
                  {(po.status === "draft" || po.status === "approved") && <Button size="sm" variant="outline" onClick={() => { setCancelPoId(po.id); setCancelPoReason(""); }}>Cancel</Button>}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Goods Receipts</CardTitle>
          <p className="text-xs text-slate-500">GRNs update physical stock. Supplier invoices post AP separately, preventing double stock movement.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {!goodsReceipts.length && <p className="py-4 text-center text-sm text-slate-400">No goods receipts yet</p>}
          {goodsReceipts.map((receipt) => (
            <div key={receipt.id} className="flex flex-col gap-1 rounded-xl border border-slate-200 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold text-slate-900">{receipt.grnNumber} · {receipt.poNumber}</div>
                <div className="text-xs text-slate-500">{receipt.supplierName || receipt.supplierId} · {receipt.receiptDate} · {receipt.lines.length} line(s)</div>
              </div>
              <div className="font-semibold">{formatMoney(receipt.subtotal)}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Supplier Invoices / Accounts Payable</CardTitle>
          <p className="text-xs text-slate-500">Invoice only quantities already received by GRN. Posting creates supplier payable; it never increases stock again.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-6">
            <label className="text-xs font-medium text-slate-600 md:col-span-2">
              Search invoice, supplier ref or PO
              <input className={inputClass + " mt-1"} value={invoiceQuery} onChange={(e) => setInvoiceQuery(e.target.value)} placeholder="Search…" />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Invoice supplier filter
              <select className={selectClass + " mt-1"} value={invoiceSupplierId} onChange={(e) => setInvoiceSupplierId(e.target.value)}>
                <option value="">All suppliers</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              Status
              <select className={selectClass + " mt-1"} value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value)}>
                <option value="">All statuses</option>
                {["draft", "posted", "partially_paid", "paid", "cancelled"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              From
              <input type="date" className={inputClass + " mt-1"} value={invoiceDateFrom} onChange={(e) => setInvoiceDateFrom(e.target.value)} />
            </label>
            <label className="text-xs font-medium text-slate-600">
              To
              <input type="date" className={inputClass + " mt-1"} value={invoiceDateTo} onChange={(e) => setInvoiceDateTo(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-slate-500">{filteredPurchaseInvoices.length} of {purchaseInvoices.length} invoices</p>
          {!filteredPurchaseInvoices.length && <p className="py-4 text-center text-sm text-slate-400">No supplier invoices match the selected filters</p>}
          {filteredPurchaseInvoices.map((invoice) => (
            <div key={invoice.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="font-semibold text-slate-900">{invoice.invoiceNumber} · {invoice.supplierName || invoice.supplierId}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {invoice.status.replace(/_/g, " ")} · PO {invoice.poNumber || "—"} · Supplier ref {invoice.supplierInvoiceNumber || "—"} · Due {invoice.dueDate || "—"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{formatMoney(invoice.total)} · balance {formatMoney(invoice.balanceAmount)}</span>
                {invoice.status === "draft" && <Button size="sm" variant="outline" onClick={() => openInvoiceEditor(invoice)}>Edit</Button>}
                {invoice.status === "draft" && <Button size="sm" onClick={() => { const r = onPostInvoice(invoice.id); setMessage(r.success ? { type: "ok", text: `${invoice.invoiceNumber} posted to AP.` } : { type: "err", text: r.error || "Posting failed" }); }}>Post</Button>}
                {(invoice.status === "posted" || invoice.status === "partially_paid") && invoice.balanceAmount > 0 && <Button size="sm" variant="outline" onClick={() => { setPayInvoiceId(invoice.id); setPayAmount(String(invoice.balanceAmount)); }}>Pay</Button>}
                {(invoice.status === "draft" || invoice.status === "posted") && invoice.paidAmount === 0 && <Button size="sm" variant="outline" onClick={() => { setCancelInvoiceId(invoice.id); setCancelInvoiceReason(""); }}>Cancel</Button>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">AP Aging</CardTitle>
          <p className="text-xs text-slate-500">Outstanding posted supplier invoices grouped by due-date age.</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="px-3 py-2 text-left">Supplier</th><th className="px-3 py-2 text-right">Current</th><th className="px-3 py-2 text-right">1–30</th><th className="px-3 py-2 text-right">31–60</th><th className="px-3 py-2 text-right">61–90</th><th className="px-3 py-2 text-right">90+</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
              <tbody>
                {!payableAging.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No posted supplier payables</td></tr>}
                {payableAging.map((row) => <tr key={row.supplierId} className="border-t border-slate-100"><td className="px-3 py-2 font-medium">{row.supplierName}</td><td className="px-3 py-2 text-right">{formatMoney(row.current)}</td><td className="px-3 py-2 text-right">{formatMoney(row.days1to30)}</td><td className="px-3 py-2 text-right">{formatMoney(row.days31to60)}</td><td className="px-3 py-2 text-right">{formatMoney(row.days61to90)}</td><td className="px-3 py-2 text-right">{formatMoney(row.days90plus)}</td><td className="px-3 py-2 text-right font-semibold">{formatMoney(row.totalOutstanding)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Modal
        open={Boolean(editPo)}
        title={editPo ? `Edit draft purchase order — ${editPo.poNumber}` : "Edit draft purchase order"}
        onClose={() => setEditPoId("")}
        className="max-w-4xl"
        footer={<>
          <Button variant="outline" onClick={() => setEditPoId("")}>Cancel</Button>
          <Button disabled={!editPoSupplierId || !editPoLines.length} onClick={savePoEdit}>Save draft changes</Button>
        </>}
      >
        {editPo && (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
              Only draft purchase orders are editable. Approval locks supplier, quantities and commercial values before receiving begins.
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="Purchase order supplier *">
                <select className={selectClass} value={editPoSupplierId} onChange={(e) => setEditPoSupplierId(e.target.value)}>
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </FormField>
              <FormField label="Expected delivery">
                <input className={inputClass} type="date" value={editPoExpectedDate} onChange={(e) => setEditPoExpectedDate(e.target.value)} />
              </FormField>
              <FormField label="Notes">
                <input className={inputClass} value={editPoNotes} onChange={(e) => setEditPoNotes(e.target.value)} />
              </FormField>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Purchase-order lines</h3>
                <Button size="sm" variant="outline" onClick={() => setEditPoLines((current) => [...current, { productId: "", description: "", quantity: "1", unitCost: "", taxRate: "0" }])}>Add line</Button>
              </div>
              {editPoLines.map((line, index) => (
                <div key={index} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[1.2fr_1.5fr_.55fr_.7fr_.55fr_auto]">
                  <select
                    className={selectClass}
                    value={line.productId}
                    onChange={(e) => {
                      const product = products.find((item) => item.id === e.target.value);
                      setEditPoLines((current) => current.map((item, i) => i === index ? {
                        ...item,
                        productId: e.target.value,
                        description: product?.name || item.description,
                        unitCost: product ? String(product.costPrice) : item.unitCost,
                      } : item));
                    }}
                  >
                    <option value="">Product (optional)</option>
                    {products.filter((product) => product.isActive).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                  <input className={inputClass} value={line.description} placeholder="Description" onChange={(e) => setEditPoLines((current) => current.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} />
                  <input className={inputClass} type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => setEditPoLines((current) => current.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} />
                  <input className={inputClass} type="number" min="0" step="0.01" value={line.unitCost} onChange={(e) => setEditPoLines((current) => current.map((item, i) => i === index ? { ...item, unitCost: e.target.value } : item))} />
                  <input className={inputClass} type="number" min="0" step="0.01" value={line.taxRate} onChange={(e) => setEditPoLines((current) => current.map((item, i) => i === index ? { ...item, taxRate: e.target.value } : item))} />
                  <Button size="sm" variant="outline" disabled={editPoLines.length === 1} onClick={() => setEditPoLines((current) => current.filter((_, i) => i !== index))}>Remove</Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(editInvoice)}
        title={editInvoice ? `Edit draft supplier invoice — ${editInvoice.invoiceNumber}` : "Edit draft supplier invoice"}
        onClose={() => setEditInvoiceId("")}
        className="max-w-4xl"
        footer={<>
          <Button variant="outline" onClick={() => setEditInvoiceId("")}>Cancel</Button>
          <Button disabled={!editInvoiceLines.some((line) => Number(line.quantity) > 0)} onClick={saveInvoiceEdit}>Save draft changes</Button>
        </>}
      >
        {editInvoice && (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
              Only draft supplier invoices are editable. Posting to Accounts Payable locks supplier invoice values; later corrections use accounting-safe cancellation/debit-note workflows.
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="Supplier invoice number">
                <input className={inputClass} value={editSupplierInvoiceNumber} onChange={(e) => setEditSupplierInvoiceNumber(e.target.value)} />
              </FormField>
              <FormField label="Invoice date">
                <input className={inputClass} type="date" value={editInvoiceDate} onChange={(e) => setEditInvoiceDate(e.target.value)} />
              </FormField>
              <FormField label="Due date">
                <input className={inputClass} type="date" value={editInvoiceDueDate} onChange={(e) => setEditInvoiceDueDate(e.target.value)} />
              </FormField>
            </div>
            <div className="space-y-2">
              {editInvoiceLines.map((line, index) => (
                <div key={line.purchaseOrderLineId} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[1.6fr_.6fr_.7fr_.6fr]">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{line.description}</div>
                    <div className="text-xs text-slate-500">Maximum editable quantity {line.invoiceableQuantity}</div>
                  </div>
                  <FormField label="Quantity">
                    <input className={inputClass} type="number" min="0" max={line.invoiceableQuantity} step="0.001" value={line.quantity} onChange={(e) => setEditInvoiceLines((current) => current.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} />
                  </FormField>
                  <FormField label="Unit cost">
                    <input className={inputClass} type="number" min="0" step="0.01" value={line.editUnitCost} onChange={(e) => setEditInvoiceLines((current) => current.map((item, i) => i === index ? { ...item, editUnitCost: e.target.value } : item))} />
                  </FormField>
                  <FormField label="Tax %">
                    <input className={inputClass} type="number" min="0" step="0.01" value={line.editTaxRate} onChange={(e) => setEditInvoiceLines((current) => current.map((item, i) => i === index ? { ...item, editTaxRate: e.target.value } : item))} />
                  </FormField>
                </div>
              ))}
            </div>
            <FormField label="Notes">
              <textarea className={inputClass + " h-20 py-2"} value={editInvoiceNotes} onChange={(e) => setEditInvoiceNotes(e.target.value)} />
            </FormField>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(cancelPo)}
        title={cancelPo ? `Cancel purchase order — ${cancelPo.poNumber}` : "Cancel purchase order"}
        onClose={() => { setCancelPoId(""); setCancelPoReason(""); }}
        footer={<>
          <Button variant="outline" onClick={() => { setCancelPoId(""); setCancelPoReason(""); }}>Keep purchase order</Button>
          <Button disabled={cancelPoReason.trim().length < 3} onClick={() => {
            if (!cancelPo) return;
            const r = onCancel(cancelPo.id, cancelPoReason.trim());
            setMessage(r.success ? { type: "ok", text: `${cancelPo.poNumber} cancelled.` } : { type: "err", text: r.error || "Cancellation failed" });
            if (r.success) { setCancelPoId(""); setCancelPoReason(""); }
          }}>Confirm cancellation</Button>
        </>}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Only unreceived draft/approved purchase orders can be cancelled. The source remains in audit history.</p>
          <FormField label="Cancellation reason *"><textarea className={inputClass + " h-20 py-2"} value={cancelPoReason} onChange={(e) => setCancelPoReason(e.target.value)} /></FormField>
        </div>
      </Modal>

      <Modal
        open={Boolean(cancelInvoice)}
        title={cancelInvoice ? `Cancel supplier invoice — ${cancelInvoice.invoiceNumber}` : "Cancel supplier invoice"}
        onClose={() => { setCancelInvoiceId(""); setCancelInvoiceReason(""); }}
        footer={<>
          <Button variant="outline" onClick={() => { setCancelInvoiceId(""); setCancelInvoiceReason(""); }}>Keep invoice</Button>
          <Button disabled={cancelInvoiceReason.trim().length < 3} onClick={() => {
            if (!cancelInvoice) return;
            const r = onCancelInvoice(cancelInvoice.id, cancelInvoiceReason.trim());
            setMessage(r.success ? { type: "ok", text: `${cancelInvoice.invoiceNumber} cancelled.` } : { type: "err", text: r.error || "Cancellation failed" });
            if (r.success) { setCancelInvoiceId(""); setCancelInvoiceReason(""); }
          }}>Confirm cancellation</Button>
        </>}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Posted unpaid invoices reverse Accounts Payable safely. Paid or partially paid invoices stay immutable and require a debit-note correction workflow.</p>
          <FormField label="Cancellation reason *"><textarea className={inputClass + " h-20 py-2"} value={cancelInvoiceReason} onChange={(e) => setCancelInvoiceReason(e.target.value)} /></FormField>
        </div>
      </Modal>

      <Modal
        open={Boolean(receiveOrder)}
        title={receiveOrder ? `Receive goods — ${receiveOrder.poNumber}` : "Receive goods"}
        onClose={() => { setReceiveOrderId(""); setReceiveQty({}); setReceiveLocation({}); setReceiveNotes(""); }}
        className="max-w-2xl"
        footer={<><Button variant="outline" onClick={() => { setReceiveOrderId(""); setReceiveQty({}); setReceiveLocation({}); setReceiveNotes(""); }}>Cancel</Button><Button onClick={submitReceipt}>Post Goods Receipt</Button></>}
      >
        {receiveOrder && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Supplier: <strong>{receiveOrder.supplierName || receiveOrder.supplierId}</strong>. Enter only the quantity physically received now.</p>
            <div className="space-y-3">
              {receiveOrder.lines.map((line) => {
                const remaining = Math.max(0, line.orderedQuantity - line.receivedQuantity);
                return (
                  <div key={line.id} className="grid gap-2 rounded-xl border border-slate-100 p-3 md:grid-cols-2">
                    <FormField label={`${line.description} received quantity`}>
                      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                        <input className={inputClass} type="number" min="0" max={remaining} step="0.001" value={receiveQty[line.id] ?? "0"} disabled={remaining <= 0} onChange={(e) => setReceiveQty((current) => ({ ...current, [line.id]: e.target.value }))} />
                        <span className="text-xs text-slate-500">remaining {remaining}</span>
                      </div>
                    </FormField>
                    <FormField label="Receive into warehouse / bin">
                      <select
                        className={selectClass}
                        value={receiveLocation[line.id] || ""}
                        disabled={!line.productId || remaining <= 0}
                        onChange={(e) => setReceiveLocation((current) => ({ ...current, [line.id]: e.target.value }))}
                      >
                        <option value="">Unallocated stock</option>
                        {warehouseLocations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.code} — {location.name} ({location.type})
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </div>
                );
              })}
            </div>
            <FormField label="Receipt notes"><input className={inputClass} value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)} placeholder="Delivery note / inspection remarks" /></FormField>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(invoiceOrder)}
        title={invoiceOrder ? `Supplier invoice — ${invoiceOrder.poNumber}` : "Supplier invoice"}
        onClose={() => { setInvoiceOrderId(""); setInvoiceQty({}); }}
        className="max-w-2xl"
        footer={<><Button variant="outline" onClick={() => { setInvoiceOrderId(""); setInvoiceQty({}); }}>Cancel</Button><Button onClick={submitInvoice}>Create Draft Invoice</Button></>}
      >
        {invoiceOrder && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Supplier invoice number"><input className={inputClass} value={supplierInvoiceNumber} onChange={(e) => setSupplierInvoiceNumber(e.target.value)} placeholder="Vendor invoice/reference" /></FormField>
              <FormField label="Due date"><input className={inputClass} type="date" value={invoiceDueDate} onChange={(e) => setInvoiceDueDate(e.target.value)} /></FormField>
            </div>
            <div className="space-y-3">
              {invoiceableLines.map((line) => (
                <FormField key={line.purchaseOrderLineId} label={`${line.description} invoice quantity`}>
                  <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                    <input className={inputClass} type="number" min="0" max={line.invoiceableQuantity} step="0.001" value={invoiceQty[line.purchaseOrderLineId] ?? "0"} disabled={line.invoiceableQuantity <= 0} onChange={(e) => setInvoiceQty((current) => ({ ...current, [line.purchaseOrderLineId]: e.target.value }))} />
                    <span className="text-xs text-slate-500">received {line.receivedQuantity} · already invoiced {line.invoicedQuantity} · available {line.invoiceableQuantity}</span>
                  </div>
                </FormField>
              ))}
            </div>
            <FormField label="Invoice notes"><input className={inputClass} value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} placeholder="Tax invoice / terms / remarks" /></FormField>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(payInvoice)}
        title={payInvoice ? `Pay supplier invoice — ${payInvoice.invoiceNumber}` : "Pay supplier invoice"}
        onClose={() => { setPayInvoiceId(""); setPayAmount(""); }}
        footer={<><Button variant="outline" onClick={() => { setPayInvoiceId(""); setPayAmount(""); }}>Cancel</Button><Button onClick={submitPayment}>Record Payment</Button></>}
      >
        {payInvoice && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Outstanding: <strong>{formatMoney(payInvoice.balanceAmount)}</strong></p>
            <FormField label="Amount"><input className={inputClass} type="number" min="0.01" max={payInvoice.balanceAmount} step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></FormField>
            <FormField label="Payment method"><select className={selectClass} value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}><option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option><option value="bank">Bank transfer</option><option value="other">Other</option></select></FormField>
          </div>
        )}
      </Modal>
    </div>
  );
}
