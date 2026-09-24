import type { Sale, SaleReturn, UUID } from "@minarvabiz/types";
import { calculateLineItem } from "@minarvabiz/billing";
import { addMinorUnits, allocateMinorByQuantityRatio, fromMinorUnits, toMinorUnits, toQuantityMilli } from "@minarvabiz/utils";

export type ReturnSelection = { saleItemId: UUID; productId: UUID; quantity: number; restock: boolean };

/** Quote from the recorded invoice, including its discount and tax. No mutations. */
export function quoteSaleReturn(sale: Sale, history: SaleReturn[], selection: ReturnSelection[]) {
  const errors: string[] = [];
  const items: Array<ReturnSelection & { productName: string; unitPrice: number; refundAmount: number }> = [];
  const previous = history.filter(r => r.saleId === sale.id && r.status === "completed").flatMap(r => r.items);
  const seen = new Set<string>();
  if (sale.deletedAt || sale.status === "cancelled" || sale.status === "returned") errors.push("Invoice is not available for return");
  if (!selection.length) errors.push("Select at least one item");
  for (const selected of selection) {
    const original = sale.items.find(i => i.id === selected.saleItemId);
    if (!original || original.productId !== selected.productId) { errors.push("Return item does not match the invoice"); continue; }
    if (seen.has(original.id)) { errors.push(`${original.productName}: duplicate return item`); continue; }
    seen.add(original.id);
    const prior = previous.filter(i => i.saleItemId === original.id);
    if (!Number.isFinite(selected.quantity) || selected.quantity <= 0 || !Number.isFinite(original.quantity) || original.quantity <= 0) {
      errors.push(`${original.productName}: return quantity exceeds remaining quantity or is invalid`); continue;
    }
    const returnedQuantityMilli = prior.reduce((sum, i) => sum + toQuantityMilli(i.quantity), 0);
    const selectedQuantityMilli = toQuantityMilli(selected.quantity);
    const originalQuantityMilli = toQuantityMilli(original.quantity);
    const cumulativeQuantityMilli = returnedQuantityMilli + selectedQuantityMilli;
    const returnedMinor = addMinorUnits(...prior.map((i) => toMinorUnits(i.refundAmount)));
    if (returnedQuantityMilli < 0 || cumulativeQuantityMilli > originalQuantityMilli) {
      errors.push(`${original.productName}: return quantity exceeds remaining quantity or is invalid`); continue;
    }
    // Older snapshots may lack lineTotal; derive only from their original invoice fields.
    const lineTotal = original.lineTotal ?? calculateLineItem(original).total;
    const lineMinor = toMinorUnits(lineTotal);
    const cumulativeRefundMinor = allocateMinorByQuantityRatio(
      lineMinor,
      cumulativeQuantityMilli / 1000,
      originalQuantityMilli / 1000
    );
    const refundMinor = cumulativeRefundMinor - returnedMinor;
    if (!Number.isFinite(lineTotal) || lineTotal < 0 || returnedMinor < 0 || refundMinor < 0) {
      errors.push(`${original.productName}: invalid invoice or previous return value`); continue;
    }
    items.push({ ...selected, productName: original.productName, unitPrice: original.unitPrice, refundAmount: fromMinorUnits(refundMinor) });
  }
  const totalMinor = addMinorUnits(...items.map((i) => toMinorUnits(i.refundAmount)));
  const availableMinor = toMinorUnits(sale.total);
  if (availableMinor < 0 ||
      !Number.isFinite(sale.paidAmount) || sale.paidAmount < 0 || !Number.isFinite(sale.balanceAmount) || sale.balanceAmount < 0 ||
      addMinorUnits(toMinorUnits(sale.paidAmount), toMinorUnits(sale.balanceAmount)) !== availableMinor) errors.push("Invoice balances are inconsistent");
  if (totalMinor > availableMinor) errors.push("Refund exceeds the remaining paid and receivable amount on this sale");
  return { items, totalRefund: fromMinorUnits(totalMinor), errors };
}
