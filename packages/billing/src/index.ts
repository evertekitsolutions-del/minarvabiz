import {
  addMinorUnits,
  fromMinorUnits,
  multiplyMinorByQuantity,
  percentOfMinor,
  subtractMinorUnits,
  toMinorUnits,
  toPercentBasisPoints,
  type MoneyMinor,
} from "@minarvabiz/utils";

export interface LineItem { quantity: number; unitPrice: number; discountPercent?: number; taxRate?: number; /** Customer-facing unitPrice already includes tax. */ taxInclusive?: boolean; }
export interface LineItemResult { subtotal: number; discountAmount: number; taxableAmount: number; taxAmount: number; total: number; }

type LineItemMinorResult = {
  subtotal: MoneyMinor;
  discountAmount: MoneyMinor;
  taxableAmount: MoneyMinor;
  taxAmount: MoneyMinor;
  total: MoneyMinor;
};

/** Split GST out of a tax-inclusive gross, rounding exactly once in paise. */
function includedTaxMinor(grossMinor: MoneyMinor, ratePercent: number): MoneyMinor {
  const basisPoints = toPercentBasisPoints(ratePercent);
  if (basisPoints < 0 || basisPoints > 10_000) throw new Error("Inclusive tax rate must be between 0 and 100%");
  const magnitude = BigInt(Math.abs(grossMinor)) * BigInt(basisPoints);
  const denominator = 10_000n + BigInt(basisPoints);
  const rounded = (magnitude + denominator / 2n) / denominator;
  const value = Number(rounded) * Math.sign(grossMinor);
  if (!Number.isSafeInteger(value)) throw new Error("Inclusive tax exceeds safe money range");
  return value;
}

function calculateLineItemMinor(item: LineItem): LineItemMinorResult {
  const unitPriceMinor = toMinorUnits(item.unitPrice);
  const enteredSubtotal = multiplyMinorByQuantity(unitPriceMinor, item.quantity);
  if (item.taxInclusive) {
    // Gross price is authoritative: never add GST on top of customer-entered Price.
    const grossDiscount = item.discountPercent ? percentOfMinor(enteredSubtotal, item.discountPercent) : 0;
    const grossAfterDiscount = subtractMinorUnits(enteredSubtotal, grossDiscount);
    const taxBeforeDiscount = includedTaxMinor(enteredSubtotal, item.taxRate ?? 0);
    const taxAmount = includedTaxMinor(grossAfterDiscount, item.taxRate ?? 0);
    const subtotal = subtractMinorUnits(enteredSubtotal, taxBeforeDiscount);
    const taxableAmount = subtractMinorUnits(grossAfterDiscount, taxAmount);
    const discountAmount = subtractMinorUnits(subtotal, taxableAmount);
    return { subtotal, discountAmount, taxableAmount, taxAmount, total: grossAfterDiscount };
  }
  const subtotal = enteredSubtotal;
  const discountAmount = item.discountPercent ? percentOfMinor(subtotal, item.discountPercent) : 0;
  const taxableAmount = subtractMinorUnits(subtotal, discountAmount);
  const taxAmount = item.taxRate ? percentOfMinor(taxableAmount, item.taxRate) : 0;
  return {
    subtotal,
    discountAmount,
    taxableAmount,
    taxAmount,
    total: addMinorUnits(taxableAmount, taxAmount),
  };
}

export function calculateLineItem(item: LineItem): LineItemResult {
  const result = calculateLineItemMinor(item);
  return {
    subtotal: fromMinorUnits(result.subtotal),
    discountAmount: fromMinorUnits(result.discountAmount),
    taxableAmount: fromMinorUnits(result.taxableAmount),
    taxAmount: fromMinorUnits(result.taxAmount),
    total: fromMinorUnits(result.total),
  };
}

export interface InvoiceTotalsInput { items: LineItem[]; globalDiscountPercent?: number; globalTaxRate?: number; }
export interface InvoiceTotals { itemsSubtotal: number; itemsDiscount: number; itemsTax: number; globalDiscount: number; globalTax: number; grandTotal: number; }

export function calculateInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotals {
  let itemsSubtotalMinor: MoneyMinor = 0;
  let itemsDiscountMinor: MoneyMinor = 0;
  let itemsTaxMinor: MoneyMinor = 0;

  for (const item of input.items) {
    const result = calculateLineItemMinor(item);
    itemsSubtotalMinor = addMinorUnits(itemsSubtotalMinor, result.subtotal);
    itemsDiscountMinor = addMinorUnits(itemsDiscountMinor, result.discountAmount);
    itemsTaxMinor = addMinorUnits(itemsTaxMinor, result.taxAmount);
  }

  const afterItemDiscountMinor = subtractMinorUnits(itemsSubtotalMinor, itemsDiscountMinor);
  const globalDiscountMinor = input.globalDiscountPercent
    ? percentOfMinor(afterItemDiscountMinor, input.globalDiscountPercent)
    : 0;
  const afterGlobalDiscountMinor = subtractMinorUnits(afterItemDiscountMinor, globalDiscountMinor);
  const globalTaxMinor = input.globalTaxRate
    ? percentOfMinor(afterGlobalDiscountMinor, input.globalTaxRate)
    : 0;
  const grandTotalMinor = addMinorUnits(afterGlobalDiscountMinor, globalTaxMinor, itemsTaxMinor);

  return {
    itemsSubtotal: fromMinorUnits(itemsSubtotalMinor),
    itemsDiscount: fromMinorUnits(itemsDiscountMinor),
    itemsTax: fromMinorUnits(itemsTaxMinor),
    globalDiscount: fromMinorUnits(globalDiscountMinor),
    globalTax: fromMinorUnits(globalTaxMinor),
    grandTotal: fromMinorUnits(grandTotalMinor),
  };
}
