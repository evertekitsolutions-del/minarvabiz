"use client";

import * as React from "react";
import { createCheckoutSubmitGate } from "./checkout-submit-gate";
import type { Product, Customer, CartLine, PaymentMethod } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { formatMoney } from "../customers/format";
import {
  calculateCartTotals, validateTender, isAreaBillableProduct,
  quoteInclusiveMrpUnitPrice,
  appendPosMeasuredCut, removePosCartRow, updatePosCartDiscount,
  updatePosCartQuantity, posCartRowKey,
  type DimensionRowDraft,
} from "@minarvabiz/business-logic";
import { generateId } from "@minarvabiz/utils";
import { DimensionRowEditor } from "./DimensionRowEditor";
import { InclusiveMrpEditor } from "./InclusiveMrpEditor";

export interface PosPaymentSplit {
  method: PaymentMethod;
  amount: number;
  reference?: string | null;
}

export interface HeldPosSale {
  id: string;
  holdNumber: string;
  customerId?: string | null;
  customerName?: string | null;
  lines: CartLine[];
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PosBillingProps {
  products: Product[];
  customers: Customer[];
  onCompleteSale?: (payload: {
    customerId: string | null;
    lines: CartLine[];
    paidAmount: number;
    paymentMethod: PaymentMethod;
    paymentSplits?: PosPaymentSplit[];
    notes?: string;
  }) => { success: boolean; invoiceNumber?: string; saleId?: string; errors?: string[] };
  onComplete?: PosBillingProps["onCompleteSale"];
  onFindByBarcode?: (barcode: string) => Product | undefined;
  onAddCustomer?: () => void;
  onAddProduct?: () => void;
  onPrintSale?: (saleId: string, paper: "a4" | "thermal") => void;
  heldSales?: HeldPosSale[];
  onHoldSale?: (payload: { customerId: string | null; lines: CartLine[]; notes?: string }) => {
    success: boolean;
    holdNumber?: string;
    errors?: string[];
  };
  onRemoveHeldSale?: (id: string) => void;
}

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
  { value: "bank", label: "Bank" },
  { value: "online", label: "Online" },
  { value: "other", label: "Other" },
];

type PaymentRow = { method: PaymentMethod; amount: string; reference: string };

const newAreaDraft = (unit: string): DimensionRowDraft => ({
  length: "", width: "", lengthUnit: "ft", widthUnit: "ft",
  pieces: "1", billableUnit: unit.trim().toLowerCase() === "sqm" ? "sqm" : "sqft",
});

function parsedTenderAmount(value: string): number {
  return value.trim() === "" ? 0 : Number(value);
}

export function PosBilling({
  products,
  customers,
  onCompleteSale,
  onComplete,
  onFindByBarcode,
  onAddCustomer,
  onAddProduct,
  onPrintSale,
  heldSales = [],
  onHoldSale,
  onRemoveHeldSale,
}: PosBillingProps) {
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [areaProductId, setAreaProductId] = React.useState<string | null>(null);
  const [mrpCartRowId, setMrpCartRowId] = React.useState<string | null>(null);
  const [appliedMrp, setAppliedMrp] = React.useState<Record<string, number>>({});
  const [areaDraft, setAreaDraft] = React.useState<DimensionRowDraft>(newAreaDraft("sqft"));
  const [search, setSearch] = React.useState("");
  const [barcode, setBarcode] = React.useState("");
  const [customerId, setCustomerId] = React.useState<string>("");
  const [notes, setNotes] = React.useState("");
  const [payments, setPayments] = React.useState<PaymentRow[]>([
    { method: "cash", amount: "", reference: "" },
  ]);
  const [heldSaleId, setHeldSaleId] = React.useState("");
  const [message, setMessage] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [lastSale, setLastSale] = React.useState<{ id: string; invoice: string } | null>(null);
  const checkoutSubmitGate = React.useRef(createCheckoutSubmitGate());

  React.useEffect(() => {
    // Only a committed empty-cart render permits the next business transaction.
    if (cart.length === 0) checkoutSubmitGate.current.release();
  }, [cart.length]);

  const totals = React.useMemo(() => calculateCartTotals(cart), [cart]);
  const tenderState = React.useMemo(
    () => validateTender(
      totals.grandTotal,
      payments.map((row) => ({
        method: row.method,
        amount: parsedTenderAmount(row.amount),
        reference: row.reference.trim() || null,
      }))
    ),
    [payments, totals.grandTotal]
  );
  const selectedAreaProduct = products.find(p => p.id === areaProductId && p.isActive);
  const balanceDue = tenderState.balanceDue;
  const changeDue = tenderState.changeDue;

  function addProduct(p: Product, qty = 1) {
    if (isAreaBillableProduct(p)) {
      setAreaProductId(p.id);
      setAreaDraft(newAreaDraft(p.unit));
      setMessage(null);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        const nextQty = existing.quantity + qty;
        if (nextQty > p.stockQuantity) {
          setMessage({ type: "err", text: `Only ${p.stockQuantity} in stock for ${p.name}.` });
          return prev;
        }
        return prev.map((l) => l.productId === p.id ? { ...l, quantity: nextQty } : l);
      }
      return [...prev, {
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
      }];
    });
    setMessage(null);
  }

  function updateQty(cartLineId: string, quantity: number) {
    try {
      // Validate synchronously: React may execute setState updater later,
      // outside this click handler's error boundary.
      const next = updatePosCartQuantity(cart, cartLineId, quantity);
      const original = cart.find((line) => posCartRowKey(line) === cartLineId);
      const mrp = appliedMrp[cartLineId];
      if (mrp !== undefined && original && quantity > 0) {
        // Quantity-adjusted tax must still remain at/below the entered MRP.
        const quote = quoteInclusiveMrpUnitPrice(mrp, original.taxRate ?? 0, quantity);
        setCart(next.map((line) => posCartRowKey(line) === cartLineId
          ? { ...line, unitPrice: quote.exclusiveUnitPrice } : line));
      } else {
        setCart(next);
        if (quantity <= 0 && mrp !== undefined) {
          setAppliedMrp((previous) => {
            const updated = { ...previous };
            delete updated[cartLineId];
            return updated;
          });
        }
      }
      setMessage(null);
    } catch (error) {
      setMessage({type:"err",text:error instanceof Error ? error.message : String(error)});
    }
  }

  function updateDiscount(cartLineId: string, discountPercent: number) {
    setCart(prev => updatePosCartDiscount(prev, cartLineId, discountPercent));
  }

  function addMeasuredCut(measurement: Parameters<typeof appendPosMeasuredCut>[2]) {
    const product = selectedAreaProduct;
    if (!product) {
      setMessage({type:"err",text:"Select an active area product first."});
      return;
    }
    try {
      const next = appendPosMeasuredCut(cart, product, measurement, generateId());
      setCart(next);
      setAreaProductId(null);
      setAreaDraft(newAreaDraft(product.unit));
      setMessage(null);
    } catch (error) {
      setMessage({type:"err",text:error instanceof Error ? error.message : String(error)});
    }
  }

  function handleBarcode(e: React.FormEvent) {
    e.preventDefault();
    const code = barcode.trim();
    if (!code) {
      setMessage({ type: "err", text: "Enter or scan a barcode first." });
      return;
    }
    const p = onFindByBarcode?.(code) || products.find((x) => x.barcode === code && x.isActive);
    if (!p) {
      setMessage({ type: "err", text: `No product found for barcode ${code}.` });
      return;
    }
    if (p.stockQuantity <= 0) {
      setMessage({ type: "err", text: `${p.name} is out of stock.` });
      return;
    }
    addProduct(p);
    setBarcode("");
  }

  function updatePayment(index: number, patch: Partial<PaymentRow>) {
    setPayments((prev) => prev.map((row, i) => i === index ? { ...row, ...patch } : row));
  }

  function addPaymentRow() {
    setPayments((prev) => [...prev, { method: "card", amount: "", reference: "" }]);
  }

  function removePaymentRow(index: number) {
    setPayments((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [{ method: "cash", amount: "", reference: "" }];
    });
  }

  function resetCheckout() {
    setCart([]);
    setAppliedMrp({}); setMrpCartRowId(null);
    setCustomerId("");
    setNotes("");
    setPayments([{ method: "cash", amount: "", reference: "" }]);
    setHeldSaleId("");
    setAreaProductId(null);
    setAreaDraft(newAreaDraft("sqft"));
  }

  function setExactPayment() {
    if (totals.grandTotal <= 0) return;
    setPayments((prev) => {
      const first = prev[0] ?? { method: "cash" as PaymentMethod, amount: "", reference: "" };
      return [{ ...first, amount: totals.grandTotal.toFixed(2) }];
    });
  }

  function complete() {
    const submit = onCompleteSale ?? onComplete;
    if (!submit) {
      setMessage({ type: "err", text: "Sale action is unavailable." });
      return;
    }
    if (!cart.length) {
      setMessage({ type: "err", text: "Add at least one product." });
      return;
    }
    const paymentSplits: PosPaymentSplit[] = payments
      .map((row) => ({
        method: row.method,
        amount: parsedTenderAmount(row.amount),
        reference: row.reference.trim() || null,
      }))
      .filter((row) => row.amount > 0);
    const paidAmount = paymentSplits.reduce((sum, row) => sum + row.amount, 0);
    const primaryMethod = paymentSplits[0]?.method ?? payments[0]?.method ?? "cash";
    if (tenderState.errors.length) {
      setMessage({ type: "err", text: tenderState.errors.join("; ") });
      return;
    }

    // React state resets are batched; a second click can still see the old cart.
    if (!checkoutSubmitGate.current.tryStart()) return;
    try {
      const result = submit({
        customerId: customerId || null,
        lines: cart,
        paidAmount,
        paymentMethod: primaryMethod,
        paymentSplits,
        notes: notes.trim() || undefined,
      });
      if (result.success) {
        setMessage({ type: "ok", text: `Sale completed — ${result.invoiceNumber}` });
        setLastSale(result.saleId && result.invoiceNumber ? { id: result.saleId, invoice: result.invoiceNumber } : null);
        resetCheckout();
      } else {
        checkoutSubmitGate.current.release();
        setMessage({ type: "err", text: (result.errors || ["Sale failed"]).join("; ") });
      }
    } catch (error) {
      checkoutSubmitGate.current.release();
      setMessage({ type: "err", text: error instanceof Error ? error.message : String(error) });
    }
  }

  function holdCurrentSale() {
    if (!onHoldSale) return;
    if (!cart.length) {
      setMessage({ type: "err", text: "Add at least one product before holding the sale." });
      return;
    }
    const result = onHoldSale({ customerId: customerId || null, lines: cart, notes: notes.trim() || undefined });
    if (!result.success) {
      setMessage({ type: "err", text: (result.errors || ["Unable to hold sale"]).join("; ") });
      return;
    }
    setMessage({ type: "ok", text: `Sale held — ${result.holdNumber || "saved"}` });
    setLastSale(null);
    resetCheckout();
  }

  function resumeHeldSale() {
    const held = heldSales.find((sale) => sale.id === heldSaleId);
    if (!held) {
      setMessage({ type: "err", text: "Select a held sale first." });
      return;
    }
    setCart(held.lines.map((line) => ({ ...line })));
    setAppliedMrp({}); setMrpCartRowId(null);
    setAreaProductId(null);
    setCustomerId(held.customerId || "");
    setNotes(held.notes || "");
    setPayments([{ method: "cash", amount: "", reference: "" }]);
    setMessage({ type: "ok", text: `Resumed ${held.holdNumber}` });
    onRemoveHeldSale?.(held.id);
    setHeldSaleId("");
  }

  const filtered = search.trim()
    ? products.filter((p) => p.isActive && (
        p.name.toLowerCase().includes(search.toLowerCase())
        || p.sku?.toLowerCase().includes(search.toLowerCase())
        || p.barcode?.includes(search)
      ))
    : products.filter((p) => p.isActive).slice(0, 12);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
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
              className="h-10 w-40 rounded-lg border border-slate-200 px-3 text-sm"
            />
            <Button type="submit" variant="outline">Add Barcode</Button>
          </form>
          {onAddProduct && <Button type="button" variant="outline" onClick={onAddProduct}>+ Product</Button>}
        </div>

        {heldSales.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <span className="text-xs font-semibold text-amber-900">Held sales ({heldSales.length})</span>
            <select
              aria-label="Held sales"
              value={heldSaleId}
              onChange={(e) => setHeldSaleId(e.target.value)}
              className="h-9 min-w-52 rounded-lg border border-amber-200 bg-white px-3 text-sm"
            >
              <option value="">Select held sale</option>
              {heldSales.map((sale) => (
                <option key={sale.id} value={sale.id}>
                  {sale.holdNumber}{sale.customerName ? ` · ${sale.customerName}` : ""} · {sale.lines.length} item(s)
                </option>
              ))}
            </select>
            <Button type="button" size="sm" variant="outline" onClick={resumeHeldSale}>Resume Sale</Button>
          </div>
        )}

        {selectedAreaProduct && isAreaBillableProduct(selectedAreaProduct) && (
          <Card>
            <CardHeader><CardTitle className="text-base">Measure {selectedAreaProduct.name}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-slate-600">
                Enter each cut separately. Available stock: {selectedAreaProduct.stockQuantity} {selectedAreaProduct.unit}.
              </p>
              <DimensionRowEditor value={areaDraft} onChange={setAreaDraft}
                onApply={addMeasuredCut} />
              <Button type="button" size="sm" variant="outline"
                onClick={() => setAreaProductId(null)}>Cancel measurement</Button>
            </CardContent>
          </Card>
        )}

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="font-medium text-slate-700">{products.length === 0 ? "No products available for POS." : "No products match this search."}</p>
            <p className="mt-1 text-sm text-slate-500">
              {products.length === 0 ? "Add a product with selling price and opening stock, then return to billing." : "Try another name, SKU or barcode."}
            </p>
            {products.length === 0 && onAddProduct && <Button type="button" className="mt-4" onClick={onAddProduct}>+ Add Product</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={p.stockQuantity <= 0}
                onClick={() => addProduct(p)}
                className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="truncate text-sm font-medium text-slate-900">{p.name}</div>
                <div className="mt-1 text-xs text-slate-500">Stock: {p.stockQuantity}</div>
                <div className="mt-1 text-sm font-semibold text-indigo-600">{formatMoney(p.sellingPrice)}</div>
                {p.stockQuantity <= 0 && <div className="mt-1 text-xs font-medium text-rose-600">Out of stock</div>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="xl:col-span-5">
        <Card className="sticky top-4">
          <CardHeader><CardTitle className="text-base font-semibold text-slate-800">Current Sale</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm"
              >
                <option value="">Walk-in customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>)}
              </select>
              <Button type="button" size="sm" variant="outline" onClick={onAddCustomer} aria-label="Add customer">+</Button>
            </div>

            <div className="max-h-56 space-y-2 overflow-y-auto">
              {cart.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Cart is empty</p>}
              {cart.map((line) => (
                <div key={line.cartLineId ?? line.productId} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{line.productName}</div>
                    {line.dimensionMetadata && <div className="text-xs text-slate-600">
                      {line.dimensionMetadata.length} {line.dimensionMetadata.lengthUnit}
                      {" × "}{line.dimensionMetadata.width} {line.dimensionMetadata.widthUnit}
                      {" × "}{line.dimensionMetadata.pieces} pcs
                      {" = "}{line.quantity} {line.dimensionMetadata.billableUnit}
                    </div>}
                    <div className="text-xs text-slate-500">{formatMoney(line.unitPrice)} each</div>
                  </div>
                  <input
                    type="number"
                    min={0.001}
                    step="any"
                    max={line.stockQuantity}
                    disabled={Boolean(line.dimensionMetadata)}
                    aria-label={`Quantity ${line.productName}`}
                    value={line.quantity}
                    onChange={(e) => updateQty(posCartRowKey(line), parseFloat(e.target.value))}
                    className="h-8 w-14 rounded border border-slate-200 px-2 text-center text-sm"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      aria-label={`Discount % ${line.productName}`}
                      placeholder="Disc %"
                      value={line.discountPercent || ""}
                      onChange={(e) => updateDiscount(posCartRowKey(line), Number(e.target.value) || 0)}
                      className="h-8 w-16 rounded border border-slate-200 px-2 text-center text-xs"
                    />
                    <span className="text-[10px] text-slate-400">%</span>
                  </div>
                  <div className="w-20 text-right text-sm font-semibold">
                    {formatMoney(calculateCartTotals([line]).grandTotal)}
                  </div>
                  <button type="button" className="text-xs text-indigo-700"
                    aria-label={`Set tax-inclusive MRP for ${line.productName}`}
                    onClick={() => setMrpCartRowId(posCartRowKey(line))}>
                    MRP
                  </button>
                  <button type="button" className="text-xs text-rose-700"
                    aria-label={`Remove ${line.productName} cut`}
                    onClick={() => {
                      const key = posCartRowKey(line);
                      setCart((prev) => removePosCartRow(prev, key));
                      setAppliedMrp((previous) => { const updated = { ...previous }; delete updated[key]; return updated; });
                    }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {mrpCartRowId && cart.find((line) => posCartRowKey(line) === mrpCartRowId) && (
              <InclusiveMrpEditor
                key={mrpCartRowId}
                line={cart.find((line) => posCartRowKey(line) === mrpCartRowId)!}
                onCancel={() => setMrpCartRowId(null)}
                onApply={(quote) => {
                  setCart((prev) => prev.map((line) =>
                    posCartRowKey(line) === mrpCartRowId
                      ? { ...line, unitPrice: quote.exclusiveUnitPrice } : line,
                  ));
                  setMrpCartRowId(null);
                  setAppliedMrp((previous) => ({ ...previous, [mrpCartRowId]: quote.enteredInclusiveMrp }));
                  setMessage({ type: "ok", text: `MRP ${formatMoney(quote.enteredInclusiveMrp)} applied. Effective inclusive unit before discount: ${formatMoney(quote.effectiveInclusiveUnitPrice)}; line total before discount: ${formatMoney(quote.effectiveInclusiveLineTotal)}.` });
                }}
              />
            )}

            <input
              type="text"
              aria-label="Sale notes"
              placeholder="Sale notes / reference"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm"
            />

            <div className="space-y-1 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{formatMoney(totals.itemsSubtotal)}</span></div>
              {totals.itemsDiscount > 0 && <div className="flex justify-between text-slate-600"><span>Discount</span><span>-{formatMoney(totals.itemsDiscount)}</span></div>}
              {totals.itemsTax > 0 && <div className="flex justify-between text-slate-600"><span>Tax</span><span>{formatMoney(totals.itemsTax)}</span></div>}
              <div className="flex justify-between text-base font-bold text-slate-900"><span>Total</span><span>{formatMoney(totals.grandTotal)}</span></div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-700">Split payment</div>
                  <div className="text-[11px] text-slate-500">Use one or more payment methods.</div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={setExactPayment}>Exact</Button>
                  <Button type="button" size="sm" variant="outline" onClick={addPaymentRow}>+ Payment</Button>
                </div>
              </div>
              {payments.map((row, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                  <select
                    aria-label={`Payment method ${index + 1}`}
                    value={row.method}
                    onChange={(e) => updatePayment(index, { method: e.target.value as PaymentMethod })}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                  >
                    {PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                  </select>
                  <input
                    aria-label={`Payment amount ${index + 1}`}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Amount"
                    value={row.amount}
                    onChange={(e) => updatePayment(index, { amount: e.target.value })}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                  />
                  <input
                    aria-label={`Payment reference ${index + 1}`}
                    type="text"
                    placeholder="Reference"
                    value={row.reference}
                    onChange={(e) => updatePayment(index, { reference: e.target.value })}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={payments.length === 1}
                    onClick={() => removePaymentRow(index)}
                    aria-label={`Remove payment ${index + 1}`}
                  >
                    ×
                  </Button>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-white p-2 text-slate-600">Tendered <strong className="float-right text-slate-900">{formatMoney(tenderState.tendered)}</strong></div>
                <div className="rounded-lg bg-white p-2 text-slate-600">Balance <strong className="float-right text-slate-900">{formatMoney(balanceDue)}</strong></div>
                <div className="rounded-lg bg-white p-2 text-slate-600">Change <strong className="float-right text-emerald-700">{formatMoney(changeDue)}</strong></div>
              </div>
              {tenderState.errors.length > 0 && (
                <p className="text-xs font-medium text-rose-600">{tenderState.errors.join("; ")}</p>
              )}
            </div>

            {message && <p className={`text-sm ${message.type === "ok" ? "text-emerald-600" : "text-rose-600"}`}>{message.text}</p>}

            {lastSale && onPrintSale && (
              <div className="flex flex-wrap gap-2 rounded-lg bg-emerald-50 p-2">
                <span className="self-center text-xs font-medium text-emerald-800">{lastSale.invoice}</span>
                <Button size="sm" variant="outline" onClick={() => onPrintSale(lastSale.id, "a4")}>Print A4</Button>
                <Button size="sm" variant="outline" onClick={() => onPrintSale(lastSale.id, "thermal")}>Print Thermal</Button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <Button type="button" variant="outline" onClick={resetCheckout}>Clear</Button>
              <Button type="button" variant="outline" disabled={!cart.length || !onHoldSale} onClick={holdCurrentSale}>Hold Sale</Button>
              <Button type="button" disabled={cart.length === 0} onClick={complete}>Complete Sale</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
