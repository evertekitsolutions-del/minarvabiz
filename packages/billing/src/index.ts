import {
  addMinorUnits,
  fromMinorUnits,
  multiplyMinorByQuantity,
  percentOfMinor,
  subtractMinorUnits,
  toMinorUnits,
  type MoneyMinor,
} from "@minarvabiz/utils";

export interface LineItem { quantity: number; unitPrice: number; discountPercent?: number; taxRate?: number; }
export interface LineItemResult { subtotal: number; discountAmount: number; taxableAmount: number; taxAmount: number; total: number; }

type LineItemMinorResult = {
  subtotal: MoneyMinor;
  discountAmount: MoneyMinor;
  taxableAmount: MoneyMinor;
  taxAmount: MoneyMinor;
  total: MoneyMinor;
};

function calculateLineItemMinor(item: LineItem): LineItemMinorResult {
  const unitPriceMinor = toMinorUnits(item.unitPrice);
  const subtotal = multiplyMinorByQuantity(unitPriceMinor, item.quantity);
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
