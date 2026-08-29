import { roundMoney, addMoney, percentOf } from "@minarvabiz/utils";
export interface LineItem { quantity: number; unitPrice: number; discountPercent?: number; taxRate?: number; }
export interface LineItemResult { subtotal: number; discountAmount: number; taxableAmount: number; taxAmount: number; total: number; }
export function calculateLineItem(item: LineItem): LineItemResult {
  const gross = roundMoney(item.quantity * item.unitPrice);
  const discountAmount = item.discountPercent ? percentOf(gross, item.discountPercent) : 0;
  const taxableAmount = roundMoney(gross - discountAmount);
  const taxAmount = item.taxRate ? percentOf(taxableAmount, item.taxRate) : 0;
  return { subtotal: gross, discountAmount, taxableAmount, taxAmount, total: addMoney(taxableAmount, taxAmount) };
}
export interface InvoiceTotalsInput { items: LineItem[]; globalDiscountPercent?: number; globalTaxRate?: number; }
export interface InvoiceTotals { itemsSubtotal: number; itemsDiscount: number; itemsTax: number; globalDiscount: number; globalTax: number; grandTotal: number; }
export function calculateInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotals {
  let itemsSubtotal = 0, itemsDiscount = 0, itemsTax = 0;
  for (const item of input.items) {
    const r = calculateLineItem(item);
    itemsSubtotal = addMoney(itemsSubtotal, r.subtotal);
    itemsDiscount = addMoney(itemsDiscount, r.discountAmount);
    itemsTax = addMoney(itemsTax, r.taxAmount);
  }
  const afterItemDiscount = roundMoney(itemsSubtotal - itemsDiscount);
  const globalDiscount = input.globalDiscountPercent ? percentOf(afterItemDiscount, input.globalDiscountPercent) : 0;
  const afterGlobalDiscount = roundMoney(afterItemDiscount - globalDiscount);
  const globalTax = input.globalTaxRate ? percentOf(afterGlobalDiscount, input.globalTaxRate) : 0;
  return { itemsSubtotal, itemsDiscount, itemsTax, globalDiscount, globalTax, grandTotal: addMoney(afterGlobalDiscount, globalTax, itemsTax) };
}
