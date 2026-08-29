"use client";

import * as React from "react";
import type { Product, Customer, CartLine, PaymentMethod } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { formatMoney } from "../customers/format";
import { calculateCartTotals } from "@minarvabiz/business-logic";

export interface PosBillingProps {
  products: Product[];
  customers: Customer[];
  onCompleteSale: (payload: {
    customerId: string | null;
    lines: CartLine[];
    paidAmount: number;
    paymentMethod: PaymentMethod;
    notes?: string;
  }) => { success: boolean; invoiceNumber?: string; errors?: string[] };
  onFindByBarcode?: (barcode: string) => Product | undefined;
}

export function PosBilling({ products, customers, onCompleteSale, onFindByBarcode }: PosBillingProps) {
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [search, setSearch] = React.useState("");
  const [barcode, setBarcode] = React.useState("");
  const [customerId, setCustomerId] = React.useState<string>("");
  const [paidAmount, setPaidAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("cash");
  const [message, setMessage] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);

  const totals = React.useMemo(() => calculateCartTotals(cart), [cart]);

  function addProduct(p: Product, qty = 1) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === p.id ? { ...l, quantity: l.quantity + qty } : l
        );
      }
      return [
        ...prev,
        {
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          barcode: p.barcode,
          quantity: qty,
          unitPrice: p.sellingPrice,
          costPrice: p.costPrice,
          discountPercent: p.discount ?? 0,
          taxRate: p.taxRate ?? 0,
          stockQuantity: p.stockQuantity,
        },
      ];
    });
    setMessage(null);
  }

  function updateQty(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((l) => l.productId !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, quantity } : l))
    );
  }

  function handleBarcode(e: React.FormEvent) {
    e.preventDefault();
    const code = barcode.trim();
    if (!code) return;
    const p =
      onFindByBarcode?.(code) ||
      products.find((x) => x.barcode === code && x.isActive);
    if (p) {
      addProduct(p);
      setBarcode("");
    } else {
      setMessage({ type: "err", text: `No product for barcode ${code}` });
    }
  }

  function complete() {
    const paid = parseFloat(paidAmount || "0") || 0;
    const result = onCompleteSale({
      customerId: customerId || null,
      lines: cart,
      paidAmount: paid,
      paymentMethod: method,
    });
    if (result.success) {
      setMessage({ type: "ok", text: `Sale completed — ${result.invoiceNumber}` });
      setCart([]);
      setPaidAmount("");
      setCustomerId("");
    } else {
      setMessage({ type: "err", text: (result.errors || ["Sale failed"]).join("; ") });
    }
  }

  const filtered = search.trim()
    ? products.filter(
        (p) =>
          p.isActive &&
          (p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.sku?.toLowerCase().includes(search.toLowerCase()) ||
            p.barcode?.includes(search))
      )
    : products.filter((p) => p.isActive).slice(0, 12);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      {/* Product picker */}
      <div className="space-y-4 xl:col-span-7">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="search"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <form onSubmit={handleBarcode} className="flex gap-2">
            <input
              type="text"
              placeholder="Scan barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="h-10 w-40 rounded-lg border border-slate-200 px-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <Button type="submit" variant="outline">Add</Button>
          </form>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => addProduct(p)}
              className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-indigo-300 hover:shadow"
            >
              <div className="truncate text-sm font-medium text-slate-900">{p.name}</div>
              <div className="mt-1 text-xs text-slate-500">Stock: {p.stockQuantity}</div>
              <div className="mt-1 text-sm font-semibold text-indigo-600">
                {formatMoney(p.sellingPrice)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Cart */}
      <div className="xl:col-span-5">
        <Card className="sticky top-4">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-800">Current Sale</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            >
              <option value="">Walk-in customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>
              ))}
            </select>

            <div className="max-h-56 space-y-2 overflow-y-auto">
              {cart.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">Cart is empty</p>
              )}
              {cart.map((line) => (
                <div key={line.productId} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{line.productName}</div>
                    <div className="text-xs text-slate-500">{formatMoney(line.unitPrice)} each</div>
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateQty(line.productId, parseInt(e.target.value, 10) || 0)}
                    className="h-8 w-16 rounded border border-slate-200 px-2 text-center text-sm"
                  />
                  <div className="w-20 text-right text-sm font-semibold">
                    {formatMoney(line.quantity * line.unitPrice)}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span><span>{formatMoney(totals.itemsSubtotal)}</span>
              </div>
              {totals.itemsDiscount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Discount</span><span>-{formatMoney(totals.itemsDiscount)}</span>
                </div>
              )}
              {totals.itemsTax > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Tax</span><span>{formatMoney(totals.itemsTax)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-slate-900">
                <span>Total</span><span>{formatMoney(totals.grandTotal)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="bank">Bank</option>
                <option value="other">Other</option>
              </select>
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="Amount paid"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
              />
            </div>

            {message && (
              <p className={`text-sm ${message.type === "ok" ? "text-emerald-600" : "text-rose-600"}`}>
                {message.text}
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setCart([])}>
                Clear
              </Button>
              <Button className="flex-1" disabled={cart.length === 0} onClick={complete}>
                Complete Sale
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
