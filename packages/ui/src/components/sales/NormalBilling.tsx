"use client";

import * as React from "react";
import type { CartLine, Customer, PaymentMethod, Product } from "@minarvabiz/types";
import { calculateCartTotals } from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { formatMoney } from "../customers/format";

type SaleResult = { success: boolean; invoiceNumber?: string; saleId?: string; errors?: string[] };

export function NormalBilling({
  products,
  customers,
  onCompleteSale,
  onAddCustomer,
  onAddProduct,
  onPrintSale,
}: {
  products: Product[];
  customers: Customer[];
  onCompleteSale: (payload: { customerId: string | null; lines: CartLine[]; paidAmount: number; paymentMethod: PaymentMethod; notes?: string }) => SaleResult;
  onAddCustomer?: () => void;
  onAddProduct?: () => void;
  onPrintSale?: (saleId: string, paper: "a4" | "thermal") => void;
}) {
  const [customerId, setCustomerId] = React.useState("");
  const [productId, setProductId] = React.useState("");
  const [qty, setQty] = React.useState("1");
  const [unitPrice, setUnitPrice] = React.useState("");
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [paidAmount, setPaidAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("cash");
  const [notes, setNotes] = React.useState("");
  const [message, setMessage] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [lastSale, setLastSale] = React.useState<{ id: string; invoice: string } | null>(null);
  const selectedProduct = products.find((p) => p.id === productId);
  const totals = React.useMemo(() => calculateCartTotals(lines), [lines]);

  React.useEffect(() => {
    setUnitPrice(selectedProduct ? String(selectedProduct.sellingPrice) : "");
  }, [selectedProduct?.id]);

  function addLine() {
    const p = selectedProduct;
    const quantity = Math.max(1, parseInt(qty, 10) || 1);
    if (!p) { setMessage({ type: "err", text: "Select a product." }); return; }
    if (quantity > p.stockQuantity) { setMessage({ type: "err", text: `Only ${p.stockQuantity} in stock for ${p.name}.` }); return; }
    const price = Math.max(0, parseFloat(unitPrice) || 0);
    setLines((prev) => {
      const existing = prev.find((line) => line.productId === p.id);
      if (existing) {
        const nextQty = existing.quantity + quantity;
        if (nextQty > p.stockQuantity) {
          setMessage({ type: "err", text: `Only ${p.stockQuantity} in stock for ${p.name}.` });
          return prev;
        }
        return prev.map((line) => line.productId === p.id ? { ...line, quantity: nextQty, unitPrice: price } : line);
      }
      return [...prev, {
        productId: p.id, productName: p.name, sku: p.sku, barcode: p.barcode,
        quantity, unitPrice: price, costPrice: p.costPrice,
        discountPercent: p.discount ?? 0, taxRate: p.taxRate ?? 0, stockQuantity: p.stockQuantity,
      }];
    });
    setMessage(null);
    setProductId("");
    setQty("1");
    setUnitPrice("");
  }

  function updateLine(productId: string, patch: Partial<CartLine>) {
    setLines((prev) => prev.map((line) => line.productId === productId ? { ...line, ...patch } : line));
  }

  function complete() {
    if (!lines.length) { setMessage({ type: "err", text: "Add at least one item." }); return; }
    const result = onCompleteSale({
      customerId: customerId || null,
      lines,
      paidAmount: Math.max(0, parseFloat(paidAmount) || 0),
      paymentMethod: method,
      notes: notes.trim() || undefined,
    });
    if (!result.success) {
      setMessage({ type: "err", text: (result.errors || ["Sale failed"]).join("; ") });
      return;
    }
    setMessage({ type: "ok", text: `Invoice ${result.invoiceNumber || ""} saved.` });
    setLastSale(result.saleId && result.invoiceNumber ? { id: result.saleId, invoice: result.invoiceNumber } : null);
    setLines([]); setPaidAmount(""); setNotes(""); setCustomerId("");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">Normal Billing</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_1.6fr_.6fr_.8fr_auto]">
            <div className="flex gap-2">
              <select className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Walk-in customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>)}
              </select>
              {onAddCustomer && <Button type="button" variant="outline" onClick={onAddCustomer}>+</Button>}
            </div>
            <div className="flex gap-2">
              <select className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm" value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Select product</option>
                {products.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name} — stock {p.stockQuantity}</option>)}
              </select>
              {onAddProduct && <Button type="button" variant="outline" onClick={onAddProduct}>+ Product</Button>}
            </div>
            <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" />
            <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="Rate" />
            <Button type="button" onClick={addLine}>Add item</Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Rate</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>{lines.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">No items added</td></tr> : lines.map((line) => (
                <tr key={line.productId} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{line.productName}</td>
                  <td className="px-3 py-2"><input className="h-8 w-20 rounded border border-slate-200 px-2" type="number" min="1" max={line.stockQuantity} value={line.quantity} onChange={(e) => updateLine(line.productId, { quantity: Math.max(1, Math.min(line.stockQuantity, parseInt(e.target.value, 10) || 1)) })} /></td>
                  <td className="px-3 py-2"><input className="h-8 w-28 rounded border border-slate-200 px-2" type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => updateLine(line.productId, { unitPrice: Math.max(0, parseFloat(e.target.value) || 0) })} /></td>
                  <td className="px-3 py-2 text-right font-semibold">{formatMoney(line.quantity * line.unitPrice)}</td>
                  <td className="px-3 py-2 text-right"><Button size="sm" variant="outline" onClick={() => setLines((prev) => prev.filter((x) => x.productId !== line.productId))}>Remove</Button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <textarea className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Bill notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span>Subtotal</span><span>{formatMoney(totals.itemsSubtotal)}</span></div>
              {totals.itemsDiscount > 0 && <div className="flex justify-between text-sm"><span>Discount</span><span>-{formatMoney(totals.itemsDiscount)}</span></div>}
              {totals.itemsTax > 0 && <div className="flex justify-between text-sm"><span>Tax</span><span>{formatMoney(totals.itemsTax)}</span></div>}
              <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{formatMoney(totals.grandTotal)}</span></div>
              <div className="grid grid-cols-2 gap-2">
                <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}><option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option><option value="bank">Bank</option><option value="online">Online</option><option value="other">Other</option></select>
                <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" type="number" min="0" step="0.01" placeholder="Paid amount" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
              </div>
              <Button className="w-full" disabled={!lines.length} onClick={complete}>Save Bill</Button>
            </div>
          </div>
          {message && <p className={`text-sm ${message.type === "ok" ? "text-emerald-600" : "text-rose-600"}`}>{message.text}</p>}
          {lastSale && onPrintSale && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><span className="font-medium">{lastSale.invoice} ready to print</span><Button size="sm" variant="outline" onClick={() => onPrintSale(lastSale.id, "a4")}>Print A4</Button><Button size="sm" variant="outline" onClick={() => onPrintSale(lastSale.id, "thermal")}>Print Thermal</Button></div>}
        </CardContent>
      </Card>
    </div>
  );
}
