/**
 * Sales billing calculations — pure functions shared Online/Offline/Hybrid.
 */

import { roundMoney, subtractMoney } from "@minarvabiz/utils";
import type { CartLine, SaleItem } from "@minarvabiz/types";
import { calculateLineItem, calculateInvoiceTotals } from "@minarvabiz/billing";

export interface CartTotals {
  itemsSubtotal: number;
  itemsDiscount: number;
  itemsTax: number;
  grandTotal: number;
  itemCount: number;
  totalQuantity: number;
}

export function calculateCartTotals(lines: CartLine[]): CartTotals {
  const items = lines.map((l) => ({
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discountPercent: l.discountPercent,
    taxRate: l.taxRate,
  }));
  const totals = calculateInvoiceTotals({ items });
  return {
    itemsSubtotal: totals.itemsSubtotal,
    itemsDiscount: totals.itemsDiscount,
    itemsTax: totals.itemsTax,
    grandTotal: totals.grandTotal,
    itemCount: lines.length,
    totalQuantity: lines.reduce((s, l) => s + l.quantity, 0),
  };
}

export function cartLineToSaleItem(line: CartLine, saleId: string, itemId: string): SaleItem {
  const calc = calculateLineItem({
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountPercent: line.discountPercent,
    taxRate: line.taxRate,
  });
  return {
    id: itemId,
    saleId,
    productId: line.productId,
    productName: line.productName,
    sku: line.sku ?? null,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    costPrice: line.costPrice,
    discountPercent: line.discountPercent,
    taxRate: line.taxRate,
    lineTotal: calc.total,
  };
}

export interface PaymentAllocation {
  total: number;
  paidAmount: number;
  balanceAmount: number;
  status: "completed" | "partial" | "draft";
}

export function allocatePayment(total: number, paidAmount: number): PaymentAllocation {
  const t = roundMoney(total);
  const p = roundMoney(Math.max(0, paidAmount));
  const balance = subtractMoney(t, p);
  let status: PaymentAllocation["status"] = "draft";
  if (p <= 0) status = "draft";
  else if (balance <= 0) status = "completed";
  else status = "partial";
  return {
    total: t,
    paidAmount: Math.min(p, t),
    balanceAmount: Math.max(0, balance),
    status,
  };
}

/** Cost of goods for a sale (inventory cost) */
export function saleCostOfGoods(items: Array<{ quantity: number; costPrice: number }>): number {
  return roundMoney(items.reduce((s, i) => s + i.quantity * i.costPrice, 0));
}

export function saleGrossProfit(total: number, items: Array<{ quantity: number; costPrice: number }>): number {
  return subtractMoney(total, saleCostOfGoods(items));
}

/**
 * Validate cart before completing sale.
 * Returns list of error messages (empty = valid).
 */
export function validateCart(lines: CartLine[], options?: { allowNegativeStock?: boolean }): string[] {
  const errors: string[] = [];
  if (lines.length === 0) errors.push("Cart is empty");
  for (const line of lines) {
    if (line.quantity <= 0) errors.push(`${line.productName}: quantity must be positive`);
    if (line.unitPrice < 0) errors.push(`${line.productName}: price cannot be negative`);
    if (!options?.allowNegativeStock && line.quantity > line.stockQuantity) {
      errors.push(`${line.productName}: insufficient stock (available ${line.stockQuantity})`);
    }
  }
  return errors;
}

/**
 * Generate a daily invoice number. Sequence is reset for a new calendar day,
 * and a persisted previous invoice can safely be used after an app restart.
 */
export function nextInvoiceNumber(lastNumber: string | null, prefix = "INV"): string {
  const now = new Date();
  const dateKey = `${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const currentPrefix = `${prefix}-${dateKey}-`;
  let seq = 1;
  if (lastNumber?.startsWith(currentPrefix)) {
    const last = parseInt(lastNumber.slice(currentPrefix.length), 10);
    if (Number.isFinite(last) && last >= 0) seq = last + 1;
  }
  return `${currentPrefix}${String(seq).padStart(4, "0")}`;
}
