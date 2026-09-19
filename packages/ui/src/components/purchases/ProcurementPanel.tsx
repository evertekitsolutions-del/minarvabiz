"use client";

import * as React from "react";
import type { GoodsReceipt, Product, PurchaseOrder, Supplier, WarehouseLocation } from "@minarvabiz/types";
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

export function ProcurementPanel({
  purchaseOrders,
  goodsReceipts,
  suppliers,
  products,
  warehouseLocations = [],
  onCreate,
  onApprove,
  onCancel,
  onReceive,
}: {
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceipt[];
  suppliers: Supplier[];
  products: Product[];
  warehouseLocations?: WarehouseLocation[];
  onCreate: (payload: {
    supplierId: string;
    expectedDeliveryDate?: string | null;
    lines: Array<{ productId?: string | null; description: string; quantity: number; unitCost: number; taxRate: number }>;
    notes?: string | null;
  }) => { success: boolean; poNumber?: string; errors?: string[] };
  onApprove: (id: string) => { success: boolean; error?: string };
  onCancel: (id: string) => { success: boolean; error?: string };
  onReceive: (payload: {
    purchaseOrderId: string;
    lines: Array<{ purchaseOrderLineId: string; quantity: number; warehouseLocationId?: string | null }>;
    notes?: string | null;
  }) => { success: boolean; grnNumber?: string; status?: string; errors?: string[] };
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

  const receiveOrder = purchaseOrders.find((po) => po.id === receiveOrderId) ?? null;

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
    const result = onReceive({
      purchaseOrderId: receiveOrder.id,
      lines: receiptLines,
      notes: receiveNotes.trim() || null,
    });
    if (!result.success) {
      setMessage({ type: "err", text: (result.errors || ["Unable to post goods receipt"]).join("; ") });
      return;
    }
    setMessage({ type: "ok", text: `${result.grnNumber || "Goods receipt"} posted · ${result.status || "received"}.` });
    setReceiveOrderId("");
    setReceiveQty({});
    setReceiveLocation({});
    setReceiveNotes("");
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
            <FormField label="Supplier *">
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
        <CardHeader><CardTitle className="text-base font-semibold">Purchase Orders</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!purchaseOrders.length && <p className="py-4 text-center text-sm text-slate-400">No purchase orders yet</p>}
          {purchaseOrders.map((po) => {
            const ordered = po.lines.reduce((sum, line) => sum + line.orderedQuantity, 0);
            const received = po.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
            return (
              <div key={po.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{po.poNumber} · {po.supplierName || po.supplierId}</div>
                  <div className="mt-1 text-xs text-slate-500">{po.status.replace(/_/g, " ")} · {po.lines.length} line(s) · Received {received}/{ordered} · Expected {po.expectedDeliveryDate || "—"}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{formatMoney(po.total)}</span>
                  {po.status === "draft" && <Button size="sm" onClick={() => { const r = onApprove(po.id); setMessage(r.success ? { type: "ok", text: `${po.poNumber} approved.` } : { type: "err", text: r.error || "Approval failed" }); }}>Approve</Button>}
                  {(po.status === "approved" || po.status === "partially_received") && <Button size="sm" onClick={() => openReceipt(po)}>Receive goods</Button>}
                  {(po.status === "draft" || po.status === "approved") && <Button size="sm" variant="outline" onClick={() => { const r = onCancel(po.id); setMessage(r.success ? { type: "ok", text: `${po.poNumber} cancelled.` } : { type: "err", text: r.error || "Cancellation failed" }); }}>Cancel</Button>}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Goods Receipts</CardTitle>
          <p className="text-xs text-slate-500">GRNs update physical stock; supplier invoice/AP is posted separately.</p>
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

      <Modal
        open={Boolean(receiveOrder)}
        title={receiveOrder ? `Receive goods — ${receiveOrder.poNumber}` : "Receive goods"}
        onClose={() => { setReceiveOrderId(""); setReceiveQty({}); setReceiveLocation({}); setReceiveNotes(""); }}
        className="max-w-2xl"
        footer={<>
          <Button variant="outline" onClick={() => { setReceiveOrderId(""); setReceiveQty({}); setReceiveLocation({}); setReceiveNotes(""); }}>Cancel</Button>
          <Button onClick={submitReceipt}>Post Goods Receipt</Button>
        </>}
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
                        <input
                          className={inputClass}
                          type="number"
                          min="0"
                          max={remaining}
                          step="0.001"
                          value={receiveQty[line.id] ?? "0"}
                          disabled={remaining <= 0}
                          onChange={(e) => setReceiveQty((current) => ({ ...current, [line.id]: e.target.value }))}
                        />
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
            <FormField label="Receipt notes">
              <input className={inputClass} value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)} placeholder="Delivery note / inspection remarks" />
            </FormField>
          </div>
        )}
      </Modal>
    </div>
  );
}
