/**
 * SAL-026 — original posted-invoice gross profit, based on the historical
 * cost snapshot captured on each sale line (not today's catalogue cost).
 *
 * Excludes sales tax and operating expenses. Returns/refunds after issuance
 * are deliberately not netted against this ORIGINAL invoice estimate.
 */
import type { Sale } from "@minarvabiz/types";
import {
  addMinorUnits, subtractMinorUnits, toMinorUnits, fromMinorUnits,
  multiplyMinorByQuantity,
} from "@minarvabiz/utils";

export interface InvoiceGrossProfit {
  readonly saleId: string;
  readonly invoiceNumber: string;
  readonly revenueExcludingTax: number;
  readonly historicalCostOfGoods: number;
  readonly grossProfit: number;
  readonly grossMarginPercent: number;
  readonly includesReturnsOrRefunds: false;
  readonly excludesOperatingExpenses: true;
}

export function calculateOriginalInvoiceGrossProfit(sale: Sale): InvoiceGrossProfit {
  if (!sale || !["completed", "partial"].includes(sale.status) ||
      sale.deletedAt || !Array.isArray(sale.items) || sale.items.length === 0) {
    throw new Error("Gross profit is available only for non-deleted posted invoices");
  }
  const revenue = subtractMinorUnits(toMinorUnits(sale.total), toMinorUnits(sale.taxAmount));
  if (revenue < 0 || toMinorUnits(sale.subtotal) < 0 ||
      toMinorUnits(sale.discountAmount) < 0) {
    throw new Error("Posted invoice revenue/tax totals are invalid");
  }
  const expected = subtractMinorUnits(toMinorUnits(sale.subtotal),
    toMinorUnits(sale.discountAmount));
  // Invoice-level tax and line allocations can differ by one minor unit due to
  // fractional line rounding. Larger drift means this snapshot is unreliable.
  if (Math.abs(revenue - expected) > 1) {
    throw new Error("Stored invoice totals are inconsistent; profit is unavailable");
  }
  const cost = addMinorUnits(...sale.items.map((item) => {
    if (typeof item.productId !== "string" || !item.productId ||
        !Number.isFinite(item.quantity) || item.quantity <= 0 ||
        !Number.isFinite(item.costPrice) || item.costPrice < 0) {
      throw new Error("Missing or invalid historical sale cost/quantity");
    }
    return multiplyMinorByQuantity(toMinorUnits(item.costPrice), item.quantity);
  }));
  const gross = subtractMinorUnits(revenue, cost);
  const margin = revenue === 0 ? 0
    : Math.round((gross / revenue) * 10000) / 100;
  return {
    saleId: sale.id,
    invoiceNumber: sale.invoiceNumber,
    revenueExcludingTax: fromMinorUnits(revenue),
    historicalCostOfGoods: fromMinorUnits(cost),
    grossProfit: fromMinorUnits(gross),
    grossMarginPercent: margin,
    includesReturnsOrRefunds: false,
    excludesOperatingExpenses: true,
  };
}
