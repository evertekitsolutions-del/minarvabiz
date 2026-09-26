"use client";

import * as React from "react";
import type { CartLine, PaymentMethod, Product, ReturnReason, Sale, SaleReturn } from "@minarvabiz/types";
import { calculateCartTotals, quoteSaleReturn } from "@minarvabiz/business-logic";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { Modal } from "../forms/Modal";
import { FormField, inputClass, selectClass } from "../forms/FormField";
import { formatMoney } from "../customers/format";

type ReturnItemInput = {
  saleItemId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  restock: boolean;
};

type ExchangeResult = {
  success: boolean;
  replacementInvoiceNumber?: string;
  storeCreditApplied?: number;
  extraRefund?: number;
  amountDue?: number;
  errors?: string[];
};

export function ReturnsPanel({
  returns,
  sales,
  products = [],
  onCreate,
  onExchange,
  preferredSaleId,
  onPreferredSaleHandled,
}: {
  returns: SaleReturn[];
  sales: Sale[];
  products?: Product[];
  onCreate: (payload: {
    saleId: string;
    reason: ReturnReason;
    notes: string;
    refundMethod: PaymentMethod;
    items: ReturnItemInput[];
  }) => { success: boolean; errors?: string[] };
  onExchange?: (payload: {
    saleId: string;
    reason: ReturnReason;
    notes: string;
    refundMethod: PaymentMethod;
    paymentMethod: PaymentMethod;
    additionalPaidAmount: number;
    returnItems: ReturnItemInput[];
    replacementLines: CartLine[];
  }) => ExchangeResult;
  preferredSaleId?: string;
  onPreferredSaleHandled?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"return" | "exchange">("return");
  const [saleId, setSaleId] = React.useState("");
  const [reason, setReason] = React.useState<ReturnReason>("customer_changed_mind");
  const [method, setMethod] = React.useState<PaymentMethod>("cash");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [qtyMap, setQtyMap] = React.useState<Record<string, number>>({});
  const [replacementProductId, setReplacementProductId] = React.useState("");
  const [replacementQty, setReplacementQty] = React.useState("1");
  const [replacementLines, setReplacementLines] = React.useState<CartLine[]>([]);
  const [additionalPaid, setAdditionalPaid] = React.useState("");
  const autoOpenedSaleRef = React.useRef<string | null>(null);

  const sale = sales.find((s) => s.id === saleId);

  React.useEffect(() => {
    if (!preferredSaleId || autoOpenedSaleRef.current === preferredSaleId) return;
    const target = sales.find((candidate) => candidate.id === preferredSaleId);
    if (!target) return;
    autoOpenedSaleRef.current = preferredSaleId;
    setSaleId(preferredSaleId);
    setMode("return");
    setQtyMap({});
    setReplacementLines([]);
    setError(null);
    setSuccess(null);
    setOpen(true);
    onPreferredSaleHandled?.();
  }, [preferredSaleId, sales, onPreferredSaleHandled]);
  const remainingQuantity = (item: Sale["items"][number]) => Math.max(0, item.quantity - returns
    .filter(r => r.saleId === sale?.id && r.status === "completed")
    .flatMap(r => r.items).filter(i => i.saleItemId === item.id).reduce((sum, i) => sum + i.quantity, 0));
  const selectedReturnItems = React.useMemo<ReturnItemInput[]>(() => {
    if (!sale) return [];
    return sale.items
      .filter((item) => (qtyMap[item.id] ?? 0) > 0)
      .map((item) => ({
        saleItemId: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: qtyMap[item.id],
        unitPrice: item.unitPrice,
        restock: true,
      }));
  }, [sale, qtyMap]);

  const returnQuote = React.useMemo(
    () => sale ? quoteSaleReturn(sale, returns, selectedReturnItems) : null,
    [sale, returns, selectedReturnItems]
  );
  const returnValue = returnQuote?.totalRefund ?? 0;
  const paidCreditAvailable = Math.min(returnValue, Math.max(0, sale?.paidAmount ?? 0));
  const replacementTotals = React.useMemo(
    () => calculateCartTotals(replacementLines),
    [replacementLines]
  );
  const creditApplied = Math.min(paidCreditAvailable, replacementTotals.grandTotal);
  const amountDue = Math.max(0, replacementTotals.grandTotal - creditApplied);
  const extraRefund = Math.max(0, paidCreditAvailable - creditApplied);

  const columns: Column<SaleReturn>[] = [
    { key: "returnNumber", header: "Return #", render: (r) => <span className="font-medium">{r.returnNumber}</span> },
    { key: "invoiceNumber", header: "Invoice" },
    { key: "customerName", header: "Customer", render: (r) => r.customerName || "Walk-in" },
    { key: "resolution", header: "Type", render: (r) => (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.resolution === "exchange" ? "bg-indigo-50 text-indigo-700" : "bg-emerald-50 text-emerald-700"}`}>
        {r.resolution === "exchange" ? "Exchange" : "Refund"}
      </span>
    ) },
    { key: "totalRefund", header: "Return value", render: (r) => formatMoney(r.totalRefund) },
    { key: "reason", header: "Reason", render: (r) => r.reason.replace(/_/g, " ") },
    { key: "exchangeInvoiceNumber", header: "Replacement", render: (r) => r.exchangeInvoiceNumber || "—" },
    { key: "createdAt", header: "Date", render: (r) => new Date(r.createdAt).toLocaleString("en-IN") },
  ];

  function resetForm() {
    setSaleId("");
    setReason("customer_changed_mind");
    setMethod("cash");
    setNotes("");
    setQtyMap({});
    setReplacementProductId("");
    setReplacementQty("1");
    setReplacementLines([]);
    setAdditionalPaid("");
    setError(null);
  }

  function openFlow(nextMode: "return" | "exchange") {
    resetForm();
    setMode(nextMode);
    setSuccess(null);
    setOpen(true);
  }

  function buildReturnItems(): ReturnItemInput[] {
    return selectedReturnItems;
  }

  function addReplacement() {
    const product = products.find((item) => item.id === replacementProductId);
    const quantity = Math.max(1, parseInt(replacementQty, 10) || 1);
    if (!product) { setError("Select a replacement product"); return; }
    const returnedToSameProduct = selectedReturnItems
      .filter((item) => item.productId === product.id && item.restock)
      .reduce((sum, item) => sum + item.quantity, 0);
    const projectedStock = product.stockQuantity + returnedToSameProduct;
    const currentQty = replacementLines.find((line) => line.productId === product.id)?.quantity ?? 0;
    if (currentQty + quantity > projectedStock) {
      setError(`${product.name}: only ${projectedStock} available after the return`);
      return;
    }
    setReplacementLines((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) return prev.map((line) => line.productId === product.id ? { ...line, quantity: line.quantity + quantity, stockQuantity: projectedStock } : line);
      return [...prev, {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        barcode: product.barcode,
        quantity,
        unitPrice: product.sellingPrice,
        costPrice: product.costPrice,
        discountPercent: product.discount ?? 0,
        taxRate: product.taxRate ?? 0,
        stockQuantity: projectedStock,
      }];
    });
    setReplacementProductId("");
    setReplacementQty("1");
    setError(null);
  }

  function submit() {
    if (!sale) { setError("Select a sale"); return; }
    const items = buildReturnItems();
    if (!items.length) { setError("Select at least one item to return"); return; }

    if (mode === "exchange") {
      if (!onExchange) { setError("Exchange is not enabled in this edition"); return; }
      if (!replacementLines.length) { setError("Add at least one replacement item"); return; }
      const result = onExchange({
        saleId: sale.id,
        reason,
        notes,
        refundMethod: method,
        paymentMethod: method,
        additionalPaidAmount: Math.max(0, parseFloat(additionalPaid) || 0),
        returnItems: items,
        replacementLines,
      });
      if (!result.success) { setError((result.errors || ["Exchange failed"]).join("; ")); return; }
      setSuccess(`Exchange completed${result.replacementInvoiceNumber ? ` · ${result.replacementInvoiceNumber}` : ""}. Credit applied ${formatMoney(result.storeCreditApplied ?? 0)}${(result.extraRefund ?? 0) > 0 ? ` · refund ${formatMoney(result.extraRefund ?? 0)}` : ""}.`);
    } else {
      const result = onCreate({ saleId: sale.id, reason, notes, refundMethod: method, items });
      if (!result.success) { setError((result.errors || ["Return failed"]).join("; ")); return; }
      setSuccess("Return/refund completed.");
    }
    setOpen(false);
    resetForm();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Returns, Refunds & Exchanges</h2>
          <p className="text-sm text-slate-500">{returns.length} completed return transactions</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openFlow("return")}>+ New Return</Button>
          {onExchange && <Button onClick={() => openFlow("exchange")}>+ New Exchange</Button>}
        </div>
      </div>
      {success && <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p>}
      <DataTable columns={columns} rows={returns} emptyMessage="No returns or exchanges yet" />

      <Modal
        open={open}
        title={mode === "exchange" ? "Process exchange" : "Process return / refund"}
        onClose={() => { setOpen(false); resetForm(); }}
        className={mode === "exchange" ? "max-w-3xl" : "max-w-lg"}
        footer={<>
          <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
          <Button onClick={submit} disabled={!returnQuote || returnQuote.errors.length > 0}>{mode === "exchange" ? "Complete exchange" : "Process refund"}</Button>
        </>}
      >
        <div className="space-y-4">
          <FormField label="Original sale *">
            <select className={selectClass} value={saleId} onChange={(e) => { setSaleId(e.target.value); setQtyMap({}); setReplacementLines([]); }}>
              <option value="">Select invoice</option>
              {sales.map((s) => <option key={s.id} value={s.id}>{s.invoiceNumber} — {formatMoney(s.total)} — {s.customerName || "Walk-in"}</option>)}
            </select>
          </FormField>

          {sale && (
            <div className="space-y-2 rounded-xl border border-slate-100 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Items being returned</div>
              {sale.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex-1">{item.productName} (remaining {remainingQuantity(item)})</span>
                  <input
                    type="number"
                    min={0}
                    max={remainingQuantity(item)}
                    step="any"
                    className="h-8 w-20 rounded border border-slate-200 px-2 text-center"
                    value={qtyMap[item.id] ?? 0}
                    onChange={(e) => setQtyMap({ ...qtyMap, [item.id]: Math.max(0, Math.min(remainingQuantity(item), Number(e.target.value) || 0)) })}
                  />
                </div>
              ))}
              {selectedReturnItems.length > 0 && returnQuote?.errors.map(message => <p key={message} className="text-sm text-rose-600">{message}</p>)}
              {selectedReturnItems.length > 0 && (
                <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-medium">
                  <span>Return value</span><span>{formatMoney(returnValue)}</span>
                </div>
              )}
            </div>
          )}

          {mode === "exchange" && sale && (
            <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/30 p-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Replacement items</div>
                <p className="mt-1 text-xs text-slate-500">Paid value from the returned item is applied as non-cash exchange credit. Only the price difference creates a payment/refund.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_100px_auto]">
                <select className={selectClass} value={replacementProductId} onChange={(e) => setReplacementProductId(e.target.value)}>
                  <option value="">Select replacement product</option>
                  {products.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` · ${p.sku}` : ""} · stock {p.stockQuantity}</option>)}
                </select>
                <input className={inputClass} type="number" min="1" value={replacementQty} onChange={(e) => setReplacementQty(e.target.value)} />
                <Button type="button" variant="outline" onClick={addReplacement}>Add</Button>
              </div>
              {replacementLines.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-100 bg-white">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2 text-left">Product</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Action</th></tr></thead>
                    <tbody>{replacementLines.map((line) => <tr key={line.productId} className="border-t border-slate-100"><td className="px-3 py-2">{line.productName}</td><td className="px-3 py-2 text-right">{line.quantity}</td><td className="px-3 py-2 text-right">{formatMoney(line.unitPrice)}</td><td className="px-3 py-2 text-right"><button type="button" className="text-xs font-medium text-rose-600" onClick={() => setReplacementLines((prev) => prev.filter((x) => x.productId !== line.productId))}>Remove</button></td></tr>)}</tbody>
                  </table>
                </div>
              )}
              <div className="grid gap-2 rounded-lg bg-white p-3 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-3"><span>Paid credit available</span><strong>{formatMoney(paidCreditAvailable)}</strong></div>
                <div className="flex justify-between gap-3"><span>Replacement total</span><strong>{formatMoney(replacementTotals.grandTotal)}</strong></div>
                <div className="flex justify-between gap-3"><span>Credit applied</span><strong>{formatMoney(creditApplied)}</strong></div>
                <div className="flex justify-between gap-3"><span>Additional amount due</span><strong>{formatMoney(amountDue)}</strong></div>
                {extraRefund > 0 && <div className="flex justify-between gap-3 text-emerald-700"><span>Refund after exchange</span><strong>{formatMoney(extraRefund)}</strong></div>}
              </div>
              <FormField label="Amount paid now">
                <input className={inputClass} type="number" min="0" max={amountDue} step="0.01" value={additionalPaid} onChange={(e) => setAdditionalPaid(e.target.value)} placeholder={amountDue.toFixed(2)} />
              </FormField>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Reason">
              <select className={selectClass} value={reason} onChange={(e) => setReason(e.target.value as ReturnReason)}>
                <option value="defective">Defective</option><option value="wrong_item">Wrong item</option><option value="customer_changed_mind">Customer changed mind</option><option value="size_issue">Size issue</option><option value="other">Other</option>
              </select>
            </FormField>
            <FormField label={mode === "exchange" ? "Difference / refund method" : "Refund method"}>
              <select className={selectClass} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                <option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option><option value="bank">Bank</option><option value="online">Online</option><option value="other">Other</option>
              </select>
            </FormField>
          </div>
          <FormField label="Notes"><input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></FormField>
          {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
