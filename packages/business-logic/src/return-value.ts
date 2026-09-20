import type { Sale, SaleReturn, UUID } from "@minarvabiz/types";
import { calculateLineItem } from "@minarvabiz/billing";

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
    const returnedQuantity = prior.reduce((sum, i) => sum + i.quantity, 0);
    const returnedCents = prior.reduce((sum, i) => sum + Math.round(i.refundAmount * 100), 0);
    const cumulativeQuantity = returnedQuantity + selected.quantity;
    if (!Number.isFinite(selected.quantity) || selected.quantity <= 0 || !Number.isFinite(original.quantity) || original.quantity <= 0 ||
        !Number.isFinite(returnedQuantity) || returnedQuantity < 0 || cumulativeQuantity > original.quantity + 1e-9) {
      errors.push(`${original.productName}: return quantity exceeds remaining quantity or is invalid`); continue;
    }
    // Older snapshots may lack lineTotal; derive only from their original invoice fields.
    const lineTotal = original.lineTotal ?? calculateLineItem(original).total;
    const lineCents = Math.round(lineTotal * 100);
    const refundCents = Math.round(lineCents * Math.min(cumulativeQuantity / original.quantity, 1)) - returnedCents;
    if (!Number.isFinite(lineTotal) || lineTotal < 0 || !Number.isSafeInteger(lineCents) ||
        !Number.isSafeInteger(returnedCents) || returnedCents < 0 || !Number.isSafeInteger(refundCents) || refundCents < 0) {
      errors.push(`${original.productName}: invalid invoice or previous return value`); continue;
    }
    items.push({ ...selected, productName: original.productName, unitPrice: original.unitPrice, refundAmount: refundCents / 100 });
  }
  const totalCents = items.reduce((sum, i) => sum + Math.round(i.refundAmount * 100), 0);
  const availableCents = Math.round(sale.total * 100);
  if (!Number.isSafeInteger(totalCents) || !Number.isSafeInteger(availableCents) || availableCents < 0 ||
      !Number.isFinite(sale.paidAmount) || sale.paidAmount < 0 || !Number.isFinite(sale.balanceAmount) || sale.balanceAmount < 0 ||
      Math.round(sale.paidAmount * 100) + Math.round(sale.balanceAmount * 100) !== availableCents) errors.push("Invoice balances are inconsistent");
  if (totalCents > availableCents) errors.push("Refund exceeds the remaining paid and receivable amount on this sale");
  return { items, totalRefund: totalCents / 100, errors };
}
