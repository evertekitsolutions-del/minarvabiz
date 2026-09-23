import type { Purchase, PurchaseInvoice, PaymentMethod } from '@minarvabiz/types';
import { nowISO } from '@minarvabiz/utils';
import { getAccount, listJournalEntries, planAutomaticPosting, type AutomaticPostingPlan } from './accounting-store';
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);
const invalid = (message: string): AutomaticPostingPlan => ({ errors: [message], commit: () => null });
const sourceEntry = (id: string, type = 'auto_purchase_invoice') => listJournalEntries().find(j => j.referenceType === type && j.referenceId === id && j.status === 'posted');

export function supplierOpeningPayableBalance(supplierId: string): number {
  const prefix = `opening-supplier-${supplierId}-`;
  let netCents = 0;
  for (const entry of listJournalEntries()) {
    if (entry.referenceType !== 'auto_opening_supplier' || entry.status !== 'posted') continue;
    const referenceId = entry.referenceId ?? '';
    if (referenceId !== supplierId && referenceId !== `opening-supplier-create-${supplierId}` && !referenceId.startsWith(prefix)) continue;
    for (const line of entry.lines) {
      if (getAccount(line.accountId)?.systemKey !== 'accounts_payable') continue;
      netCents += cents(line.credit) - cents(line.debit);
    }
  }
  return Math.max(0, netCents) / 100;
}

export function planPurchaseInvoicePosting(invoice: PurchaseInvoice): AutomaticPostingPlan {
  const values = [invoice.subtotal, invoice.taxAmount, invoice.total, invoice.paidAmount, invoice.balanceAmount,
    ...invoice.lines.flatMap(l => [l.invoicedQuantity, l.unitCost, l.taxRate, l.lineSubtotal, l.taxAmount, l.lineTotal])];
  if (!invoice.lines.length || values.some(v => !Number.isFinite(v) || v < 0 || !Number.isSafeInteger(cents(v))) || invoice.paidAmount !== 0
    || cents(invoice.balanceAmount) !== cents(invoice.total)) return invalid('Invalid supplier invoice accounting amounts');
  let stock = 0, unclassified = 0, tax = 0;
  for (const line of invoice.lines) {
    if (line.invoicedQuantity <= 0 || cents(line.lineSubtotal) !== cents(line.invoicedQuantity * line.unitCost)
      || cents(line.taxAmount) !== cents(line.lineSubtotal * line.taxRate / 100)
      || cents(line.lineTotal) !== cents(line.lineSubtotal) + cents(line.taxAmount)) return invalid('Supplier invoice line amounts are inconsistent');
    if (line.productId) stock += cents(line.lineSubtotal); else unclassified += cents(line.lineSubtotal);
    tax += cents(line.taxAmount);
  }
  if (stock + unclassified !== cents(invoice.subtotal) || tax !== cents(invoice.taxAmount) || stock + unclassified + tax !== cents(invoice.total)) return invalid('Supplier invoice totals are inconsistent');
  return planAutomaticPosting({ referenceType: 'auto_purchase_invoice', referenceId: invoice.id, date: invoice.invoiceDate,
    branchId: invoice.branchId, description: 'Supplier invoice ' + invoice.invoiceNumber,
    lines: [{ key: 'inventory_asset', debit: stock / 100 }, { key: 'unclassified_purchases', debit: unclassified / 100 },
      { key: 'purchase_tax_pending', debit: tax / 100 }, { key: 'accounts_payable', credit: invoice.total }] });
}

export function planPurchaseInvoiceCancellation(invoice: PurchaseInvoice): AutomaticPostingPlan {
  const original = sourceEntry(invoice.id);
  if (!original) return { errors: [], commit: () => null }; // No retrospective journal for old documents.
  const lines = original.lines.map(line => ({ key: getAccount(line.accountId)?.systemKey ?? '', debit: line.credit, credit: line.debit }));
  return planAutomaticPosting({ referenceType: 'auto_purchase_cancel', referenceId: invoice.id, date: nowISO(),
    branchId: invoice.branchId, description: 'Cancel supplier invoice ' + invoice.invoiceNumber, lines });
}

export function planSupplierPaymentPosting(input: { id: string; amount: number; method: PaymentMethod; date: string;
  allocations: Array<{ id: string; type: 'invoice' | 'purchase'; amount: number }>; openingAmount?: number }): AutomaticPostingPlan {
  const documentPayable = input.allocations
    .filter(a => sourceEntry(a.id, a.type === 'invoice' ? 'auto_purchase_invoice' : 'auto_direct_purchase'))
    .reduce((sum, a) => sum + cents(a.amount), 0);
  const openingPayable = cents(input.openingAmount ?? 0);
  const total = cents(input.amount);
  if (![documentPayable, openingPayable, total].every(Number.isSafeInteger) || openingPayable < 0 || documentPayable + openingPayable > total) {
    return invalid('Invalid supplier payment accounting allocation');
  }
  const payable = documentPayable + openingPayable;
  return planAutomaticPosting({ referenceType: 'auto_supplier_payment', referenceId: input.id, date: input.date,
    description: 'Supplier payment ' + input.id, lines: [
      { key: 'accounts_payable', debit: payable / 100 },
      { key: 'legacy_settlement_clearing', debit: (total - payable) / 100 },
      { key: input.method === 'cash' ? 'cash' : input.method === 'bank' ? 'bank' : 'payment_clearing', credit: input.amount },
    ] });
}

export function planPurchaseReturnPosting(input: { id: string; purchaseId?: string | null; amount: number; createdAt: string; branchId?: string | null }): AutomaticPostingPlan {
  if (!Number.isFinite(input.amount) || input.amount <= 0 || !Number.isSafeInteger(cents(input.amount))) {
    return invalid('Invalid purchase return accounting amount');
  }
  const sourcePosted = !!input.purchaseId && !!(sourceEntry(input.purchaseId, 'auto_direct_purchase') || sourceEntry(input.purchaseId, 'auto_purchase_invoice'));
  return planAutomaticPosting({ referenceType: 'auto_purchase_return', referenceId: input.id, date: input.createdAt,
    branchId: input.branchId ?? null, description: 'Purchase return ' + input.id,
    lines: [
      { key: sourcePosted ? 'accounts_payable' : 'legacy_settlement_clearing', debit: input.amount },
      { key: 'purchase_returns_pending', credit: input.amount },
    ] });
}

/** Description-only purchases stay unclassified until reviewed; no stock or tax inference. */
export function planDirectPurchasePosting(purchase: Purchase): AutomaticPostingPlan {
  if (![purchase.amount, purchase.paidAmount, purchase.balanceAmount].every(n => Number.isFinite(n) && n >= 0 && Number.isSafeInteger(cents(n)))
    || cents(purchase.amount) <= 0 || cents(purchase.amount) !== cents(purchase.paidAmount) + cents(purchase.balanceAmount)
    || (purchase.balanceAmount > 0 && !purchase.supplierId)) return invalid('Invalid direct purchase accounting amounts or supplier');
  if (!['cash', 'bank', 'card', 'upi', 'online', 'other'].includes(purchase.paymentMethod)) return invalid('Invalid payment method');
  return planAutomaticPosting({ referenceType: 'auto_direct_purchase', referenceId: purchase.id, date: purchase.date,
    description: 'Direct purchase ' + purchase.purchaseNumber, lines: [
      { key: 'unclassified_purchases', debit: purchase.amount },
      { key: purchase.paymentMethod === 'cash' ? 'cash' : purchase.paymentMethod === 'bank' ? 'bank' : 'payment_clearing', credit: purchase.paidAmount },
      { key: 'accounts_payable', credit: purchase.balanceAmount },
    ] });
}
