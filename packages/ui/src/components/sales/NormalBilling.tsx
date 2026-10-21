"use client";

import * as React from "react";
import { createCheckoutSubmitGate } from "./checkout-submit-gate";
import type { CartLine, Customer, PaymentMethod, Product } from "@minarvabiz/types";
import {
  calculateCartTotals, isAreaBillableProduct, attachNormalAreaMeasurement,
  appendNormalBillingLine, updateNormalBillingLine, removeNormalBillingLine,
  quoteInclusiveMrpUnitPrice,
  type DimensionRowDraft, type DimensionMeasurement,
} from "@minarvabiz/business-logic";
import { DimensionRowEditor } from "./DimensionRowEditor";
import { InclusiveMrpEditor } from "./InclusiveMrpEditor";
import { generateId } from "@minarvabiz/utils";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { formatMoney } from "../customers/format";

type SaleResult = { success: boolean; invoiceNumber?: string; saleId?: string; errors?: string[] };

const emptyAreaDraft = (unit: "sqft" | "sqm" = "sqft"): DimensionRowDraft => ({
  length: "", width: "", lengthUnit: "ft", widthUnit: "ft",
  billableUnit: unit, pieces: "1",
});

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
  const [areaMode, setAreaMode] = React.useState(false);
  const [areaDraft, setAreaDraft] = React.useState<DimensionRowDraft>(emptyAreaDraft());
  const [areaApplied, setAreaApplied] = React.useState<DimensionMeasurement | null>(null);
  const [unitPrice, setUnitPrice] = React.useState("");
  const [mrpLineId, setMrpLineId] = React.useState<string | null>(null);
  const [appliedMrp, setAppliedMrp] = React.useState<Record<string, number>>({});
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [paidAmount, setPaidAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("cash");
  const [notes, setNotes] = React.useState("");
  const [message, setMessage] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [lastSale, setLastSale] = React.useState<{ id: string; invoice: string } | null>(null);
  const checkoutSubmitGate = React.useRef(createCheckoutSubmitGate());

  React.useEffect(() => {
    if (lines.length === 0) checkoutSubmitGate.current.release();
  }, [lines.length]);
  const selectedProduct = products.find((p) => p.id === productId);
  const totals = React.useMemo(() => calculateCartTotals(lines), [lines]);

  React.useEffect(() => {
    setUnitPrice(selectedProduct ? String(selectedProduct.sellingPrice) : "");
  }, [selectedProduct?.id]);

  function addLine() {
    const p = selectedProduct;
    const quantity = areaMode ? areaApplied?.quantity ?? NaN : Number(qty);
    if (!p) { setMessage({ type: "err", text: "Select a product." }); return; }
    if (areaMode && !areaApplied) {
      setMessage({ type: "err", text: "Apply a valid area measurement first." });
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setMessage({ type: "err", text: "Quantity must be a positive number." });
      return;
    }
    if (quantity > p.stockQuantity) { setMessage({ type: "err", text: `Only ${p.stockQuantity} in stock for ${p.name}.` }); return; }
    const price = Number(unitPrice);
    if (!unitPrice.trim() || !Number.isFinite(price) || price < 0) {
      setMessage({ type: "err", text: "Enter a valid non-negative selling price." });
      return;
    }
    try {
      const item: CartLine = {
        productId: p.id, productName: p.name, sku: p.sku, barcode: p.barcode,
        quantity, unitPrice: price, costPrice: p.costPrice,
        discountPercent: p.discount ?? 0, taxRate: p.taxRate ?? 0, stockQuantity: p.stockQuantity,
      };
      const next = areaMode
        ? { ...attachNormalAreaMeasurement(item, p, areaApplied), cartLineId: generateId() }
        : item;
      // Each separately measured cut retains its own immutable audit and ID.
      setLines(appendNormalBillingLine(lines, next));
    } catch (error) {
      setMessage({ type: "err", text: error instanceof Error ? error.message : String(error) });
      return;
    }
    setMessage(null);
    setProductId("");
    setQty("1");
    setUnitPrice("");
    setAreaMode(false);
    setAreaApplied(null);
    setAreaDraft(emptyAreaDraft());
  }

  function updateLine(cartLineId: string, patch: Partial<CartLine>) {
    try {
      const row = lines.find((line) => (line.cartLineId ?? line.productId) === cartLineId);
      const converted = row && patch.quantity !== undefined && appliedMrp[cartLineId] !== undefined
        ? { ...patch, unitPrice: quoteInclusiveMrpUnitPrice(
          appliedMrp[cartLineId], row.taxRate ?? 0, patch.quantity,
        ).exclusiveUnitPrice }
        : patch;
      const next = updateNormalBillingLine(lines, cartLineId, converted);
      setLines(next);
      if (patch.unitPrice !== undefined && patch.quantity === undefined) {
        setAppliedMrp((previous) => {
          const updated = { ...previous };
          delete updated[cartLineId];
          return updated;
        });
      }
      setMessage(null);
    } catch (error) {
      setMessage({ type: "err", text: error instanceof Error ? error.message : String(error) });
    }
  }

  function complete() {
    if (!lines.length) { setMessage({ type: "err", text: "Add at least one item." }); return; }
    const payment = paidAmount.trim() === "" ? 0 : Number(paidAmount);
    if (!Number.isFinite(payment) || payment < 0) {
      setMessage({ type: "err", text: "Paid amount must be a valid non-negative number." });
      return;
    }
    // A successful synchronous submit remains latched until the cleared cart
    // is committed. React setState does not immediately change this closure.
    if (!checkoutSubmitGate.current.tryStart()) return;
    try {
      const result = onCompleteSale({
        customerId: customerId || null,
        lines,
        paidAmount: payment,
        paymentMethod: method,
        notes: notes.trim() || undefined,
      });
      if (!result.success) {
        checkoutSubmitGate.current.release();
        setMessage({ type: "err", text: (result.errors || ["Sale failed"]).join("; ") });
        return;
      }
      setMessage({ type: "ok", text: `Invoice ${result.invoiceNumber || ""} saved.` });
      setLastSale(result.saleId && result.invoiceNumber ? { id: result.saleId, invoice: result.invoiceNumber } : null);
      setLines([]); setAppliedMrp({}); setPaidAmount(""); setNotes(""); setCustomerId("");
    } catch (error) {
      checkoutSubmitGate.current.release();
      setMessage({ type: "err", text: error instanceof Error ? error.message : String(error) });
    }
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
              <select className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm" value={productId} onChange={(e) => {
                setProductId(e.target.value);
                setAreaMode(false); setAreaApplied(null); setQty("1");
                const unit = products.find(product => product.id === e.target.value)?.unit?.trim().toLowerCase();
                setAreaDraft(emptyAreaDraft(unit === "sqm" ? "sqm" : "sqft"));
              }}>
                <option value="">Select product</option>
                {products.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name} — stock {p.stockQuantity}</option>)}
              </select>
              {onAddProduct && <Button type="button" variant="outline" onClick={onAddProduct}>+ Product</Button>}
            </div>
            <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" type="number" min="0.001" step="any"
              disabled={areaMode} value={qty} onChange={(e) => setQty(e.target.value)}
              aria-label={areaMode ? "Calculated area quantity" : "Quantity"} placeholder="Qty" />
            <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="Rate" />
            <Button type="button" onClick={addLine}>Add item</Button>
          </div>
          {selectedProduct && isAreaBillableProduct(selectedProduct) && (
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={areaMode} onChange={(e) => {
                setAreaMode(e.target.checked);
                setAreaApplied(null);
                setQty("1");
                setAreaDraft(emptyAreaDraft(selectedProduct.unit.trim().toLowerCase() === "sqm" ? "sqm" : "sqft"));
              }} />
              Measure by area ({selectedProduct.unit})
            </label>
          )}
          {areaMode && selectedProduct && isAreaBillableProduct(selectedProduct) && (
            <DimensionRowEditor value={areaDraft}
              onChange={(next) => { setAreaDraft(next); setAreaApplied(null); setQty("1"); }}
              onApply={(measurement) => {
                setAreaApplied(measurement);
                setQty(String(measurement.quantity));
              }} />
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Rate</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>{lines.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">No items added</td></tr> : lines.map((line) => (
                <tr key={line.cartLineId ?? line.productId} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{line.productName}
                    {line.dimensionMetadata && <div className="text-xs font-normal text-slate-600">
                      {line.dimensionMetadata.length} {line.dimensionMetadata.lengthUnit}
                      {" × "}{line.dimensionMetadata.width} {line.dimensionMetadata.widthUnit}
                      {" × "}{line.dimensionMetadata.pieces} pcs
                      {" = "}{line.quantity} {line.dimensionMetadata.billableUnit}
                    </div>}
                  </td>
                  <td className="px-3 py-2"><input className="h-8 w-20 rounded border border-slate-200 px-2" type="number" min="0.001" step="any" max={line.stockQuantity}
                    disabled={Boolean(line.dimensionMetadata)} value={line.quantity} onChange={(e) => updateLine(line.cartLineId ?? line.productId, { quantity: Number(e.target.value) })} /></td>
                  <td className="px-3 py-2"><input className="h-8 w-28 rounded border border-slate-200 px-2" type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => updateLine(line.cartLineId ?? line.productId, { unitPrice: Number(e.target.value) })} /></td>
                  <td className="px-3 py-2 text-right font-semibold">{formatMoney(line.quantity * line.unitPrice)}</td>
                  <td className="px-3 py-2 text-right"><div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => setMrpLineId(line.cartLineId ?? line.productId)}>MRP incl. tax</Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      const id = line.cartLineId ?? line.productId;
                      setLines((prev) => removeNormalBillingLine(prev, id));
                      setAppliedMrp((previous) => { const updated = { ...previous }; delete updated[id]; return updated; });
                    }}>Remove</Button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          {mrpLineId && lines.find((line) => (line.cartLineId ?? line.productId) === mrpLineId) && (
            <InclusiveMrpEditor
              key={mrpLineId}
              line={lines.find((line) => (line.cartLineId ?? line.productId) === mrpLineId)!}
              onCancel={() => setMrpLineId(null)}
              onApply={(quote) => {
                updateLine(mrpLineId, { unitPrice: quote.exclusiveUnitPrice });
                setAppliedMrp((previous) => ({ ...previous, [mrpLineId]: quote.enteredInclusiveMrp }));
                setMrpLineId(null);
                setMessage({ type: "ok", text: `MRP ${formatMoney(quote.enteredInclusiveMrp)} applied. Effective inclusive unit before discount: ${formatMoney(quote.effectiveInclusiveUnitPrice)}; line total before discount: ${formatMoney(quote.effectiveInclusiveLineTotal)}; exclusive rate: ${formatMoney(quote.exclusiveUnitPrice)}.` });
              }}
            />
          )}

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
