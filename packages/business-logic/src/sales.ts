/**
 * Sales billing calculations — pure functions shared Online/Offline/Hybrid.
 */

import {
  addMinorUnits,
  fromMinorUnits,
  multiplyMinorByQuantity,
  subtractMinorUnits,
  toMinorUnits,
  toQuantityMilli,
  QUANTITY_MILLI_FACTOR,
  type MoneyMinor,
} from "@minarvabiz/utils";
import { addStockQuantities } from "./inventory";
import { parseDimensionLineMetadata } from "./dimensional-billing";
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

/** Preserve exact 0.001 stock precision before attaching area audit data. */
function exactDimensionQuantityMilli(quantity: number): number {
  const quantityMilli = toQuantityMilli(quantity);
  if (Math.abs(quantityMilli / QUANTITY_MILLI_FACTOR - quantity) > 1e-9) {
    throw new Error("Dimension quantity must have at most 3 decimal places");
  }
  return quantityMilli;
}

export function cartLineToSaleItem(line: CartLine, saleId: string, itemId: string): SaleItem {
  const calc = calculateLineItem({
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountPercent: line.discountPercent,
    taxRate: line.taxRate,
  });
  const dimensionMetadata = line.dimensionMetadata == null ? undefined
    : parseDimensionLineMetadata(line.dimensionMetadata, exactDimensionQuantityMilli(line.quantity));
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
    ...(dimensionMetadata ? { dimensionMetadata } : {}),
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
  const errors: string[] = [];
  let payableMinor: MoneyMinor;
  try {
    if (!Number.isFinite(total) || total < 0) throw new Error("invalid payable");
    payableMinor = toMinorUnits(total);
  } catch {
    return { tendered: 0, collectible: 0, balanceDue: 0, changeDue: 0, cashTendered: 0, errors: ["Payable amount is invalid"] };
  }

  const normalized: Array<{ method: PaymentMethod; amountMinor: MoneyMinor; reference: string | null }> = [];
  for (const split of splits) {
    if (!["cash", "bank", "card", "upi", "online", "other"].includes(split.method)) {
      errors.push("Invalid payment method");
      continue;
    }
    if (typeof split.amount !== "number" || !Number.isFinite(split.amount)) {
      errors.push(`${split.method}: payment amount must be finite and within range`);
      continue;
    }
    try {
      const amountMinor = toMinorUnits(split.amount);
      normalized.push({ method: split.method, amountMinor, reference: split.reference ?? null });
    } catch {
      errors.push(`${split.method}: payment amount must be finite and within range`);
    }
  }

  const nonZero = normalized.filter((split) => split.amountMinor !== 0);
  for (const split of nonZero) {
    if (split.amountMinor < 0) errors.push(`${split.method}: payment amount cannot be negative`);
  }

  const positive = nonZero.filter((split) => split.amountMinor > 0);
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

/**
 * Convert gross POS tenders into actual method-by-method receipts.
 *
 * Cash given as change is not business revenue and MUST be subtracted from
 * cash only, even when a cash split precedes card/UPI/bank in the input.
 * This preserves card and bank settlement amounts independently of UI order.
 * Monetary arithmetic stays in integer minor units (no floating drift).
 *
 * Consumers must persist these net receipts (not gross tender rows) to both
 * payment records and accounting; the original changeDue remains available
 * for the cash drawer receipt.
 */
export function settleTenderReceipts(
  total: number,
  splits: TenderSplit[],
): TenderValidation & { settledSplits: TenderSplit[] } {
  const validation = validateTender(total, splits);
  if (validation.errors.length) return { ...validation, settledSplits: [] };

  let changeRemaining: MoneyMinor = toMinorUnits(validation.changeDue);
  const settledSplits: TenderSplit[] = [];
  for (const split of splits) {
    let receiptMinor = toMinorUnits(split.amount);
    if (split.method === "cash" && changeRemaining > 0) {
      const returnedMinor = Math.min(receiptMinor, changeRemaining);
      receiptMinor = subtractMinorUnits(receiptMinor, returnedMinor);
      changeRemaining = subtractMinorUnits(changeRemaining, returnedMinor);
    }
    if (receiptMinor > 0) {
      settledSplits.push({ ...split, amount: fromMinorUnits(receiptMinor) });
    }
  }

  const collectedMinor = addMinorUnits(...settledSplits.map((split) => toMinorUnits(split.amount)));
  if (changeRemaining !== 0 || collectedMinor !== toMinorUnits(validation.collectible)) {
    return {
      ...validation,
      errors: ["Tender method allocation does not reconcile to net amount collected"],
      settledSplits: [],
    };
  }
  return { ...validation, settledSplits };
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
  const requestedByProduct = new Map<string, { productName: string; quantity: number; stock: number }>();
  if (lines.length === 0) errors.push("Cart is empty");
  for (const line of lines) {
    if (line.dimensionMetadata != null) {
      try {
        parseDimensionLineMetadata(line.dimensionMetadata, exactDimensionQuantityMilli(line.quantity));
      } catch {
        errors.push(`${line.productName}: dimension measurement does not match sale quantity`);
      }
    }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) errors.push(`${line.productName}: quantity must be positive`);
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) errors.push(`${line.productName}: price cannot be negative`);
    if (!Number.isFinite(line.discountPercent)) errors.push(`${line.productName}: discount must be a finite number`);
    if (!Number.isFinite(line.taxRate)) errors.push(`${line.productName}: tax rate must be a finite number`);
    if (!Number.isFinite(line.costPrice) || line.costPrice < 0) errors.push(`${line.productName}: cost must be a finite non-negative amount`);
    if (typeof line.productId !== "string" || !line.productId) errors.push(`${line.productName}: valid product is required`);
    if (Number.isFinite(line.quantity) && line.quantity > 0 && line.productId) {
      const current = requestedByProduct.get(line.productId);
      try {
        const normalized = toQuantityMilli(line.quantity) / QUANTITY_MILLI_FACTOR;
        if (normalized <= 0 || Math.abs(normalized - line.quantity) > 1e-9) {
          errors.push(`${line.productName}: quantity must have at most 3 decimal places`);
        }
        requestedByProduct.set(line.productId, {
          productName: line.productName,
          quantity: addStockQuantities(current?.quantity ?? 0, line.quantity),
          stock: Math.min(current?.stock ?? Infinity, addStockQuantities(line.stockQuantity, 0)),
        });
      } catch {
        errors.push(`${line.productName}: quantity exceeds the safe range`);
      }
    }
  }
  if (!options?.allowNegativeStock) {
    for (const { productName, quantity, stock } of requestedByProduct.values()) {
      if (!Number.isFinite(stock) || stock < 0 || quantity > stock) {
        errors.push(`${productName}: insufficient stock (available ${stock})`);
      }
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
