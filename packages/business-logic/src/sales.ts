/**
 * Sales billing calculations — pure functions shared Online/Offline/Hybrid.
 */

import {
  addMinorUnits,
  fromMinorUnits,
  multiplyMinorByQuantity,
  subtractMinorUnits,
  toMinorUnits,
  type MoneyMinor,
} from "@minarvabiz/utils";
import type { CartLine, SaleItem, PaymentMethod } from "@minarvabiz/types";
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
  const totalMinor = toMinorUnits(total);
  const paidMinor = toMinorUnits(Math.max(0, paidAmount));
  const collectibleMinor = Math.min(paidMinor, totalMinor);
  const balanceMinor = Math.max(0, subtractMinorUnits(totalMinor, collectibleMinor));
  let status: PaymentAllocation["status"] = "draft";
  if (collectibleMinor <= 0) status = "draft";
  else if (balanceMinor <= 0) status = "completed";
  else status = "partial";
  return {
    total: fromMinorUnits(totalMinor),
    paidAmount: fromMinorUnits(collectibleMinor),
    balanceAmount: fromMinorUnits(balanceMinor),
    status,
  };
}

export interface TenderSplit {
  method: PaymentMethod;
  amount: number;
  reference?: string | null;
}

export interface TenderValidation {
  tendered: number;
  collectible: number;
  balanceDue: number;
  changeDue: number;
  cashTendered: number;
  errors: string[];
}

/**
 * Validate a POS tender before creating payment rows.
 * Over-tender is only allowed when the excess can be returned from a cash split.
 * This prevents accidental overcharging on card/UPI/bank tenders while still
 * supporting normal cash-change workflows.
 */
export function validateTender(total: number, splits: TenderSplit[]): TenderValidation {
  const payableMinor = toMinorUnits(Math.max(0, total));
  const normalized = splits
    .map((split) => ({
      method: split.method,
      amountMinor: toMinorUnits(Number(split.amount) || 0),
      reference: split.reference ?? null,
    }))
    .filter((split) => split.amountMinor !== 0);

  const errors: string[] = [];
  for (const split of normalized) {
    if (split.amountMinor < 0) errors.push(`${split.method}: payment amount cannot be negative`);
  }

  const positive = normalized.filter((split) => split.amountMinor > 0);
  const tenderedMinor = addMinorUnits(...positive.map((split) => split.amountMinor));
  const cashTenderedMinor = addMinorUnits(
    ...positive.filter((split) => split.method === "cash").map((split) => split.amountMinor)
  );
  const collectibleMinor = Math.min(payableMinor, tenderedMinor);
  const balanceDueMinor = Math.max(0, subtractMinorUnits(payableMinor, tenderedMinor));
  const changeDueMinor = Math.max(0, subtractMinorUnits(tenderedMinor, payableMinor));

  if (changeDueMinor > 0 && cashTenderedMinor < changeDueMinor) {
    errors.push("Overpayment must be covered by cash so the excess can be returned as change");
  }

  return {
    tendered: fromMinorUnits(tenderedMinor),
    collectible: fromMinorUnits(collectibleMinor),
    balanceDue: fromMinorUnits(balanceDueMinor),
    changeDue: fromMinorUnits(changeDueMinor),
    cashTendered: fromMinorUnits(cashTenderedMinor),
    errors,
  };
}

/** Cost of goods for a sale (inventory cost) */
export function saleCostOfGoods(items: Array<{ quantity: number; costPrice: number }>): number {
  let totalMinor: MoneyMinor = 0;
  for (const item of items) {
    totalMinor = addMinorUnits(totalMinor, multiplyMinorByQuantity(toMinorUnits(item.costPrice), item.quantity));
  }
  return fromMinorUnits(totalMinor);
}

export function saleGrossProfit(total: number, items: Array<{ quantity: number; costPrice: number }>): number {
  return fromMinorUnits(subtractMinorUnits(toMinorUnits(total), toMinorUnits(saleCostOfGoods(items))));
}

/**
 * Validate cart before completing sale.
 * Returns list of error messages (empty = valid).
 */
export function validateCart(lines: CartLine[], options?: { allowNegativeStock?: boolean }): string[] {
  const errors: string[] = [];
  if (lines.length === 0) errors.push("Cart is empty");
  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) errors.push(`${line.productName}: quantity must be positive`);
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) errors.push(`${line.productName}: price cannot be negative`);
    if (!Number.isFinite(line.discountPercent)) errors.push(`${line.productName}: discount must be a finite number`);
    if (!Number.isFinite(line.taxRate)) errors.push(`${line.productName}: tax rate must be a finite number`);
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
