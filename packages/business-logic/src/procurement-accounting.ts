import type { Purchase, PurchaseInvoice, PaymentMethod } from '@minarvabiz/types';
import { nowISO } from '@minarvabiz/utils';
import { getAccount, listJournalEntries, planAutomaticPosting, type AutomaticPostingPlan } from './accounting-store';
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);
const invalid = (message: string): AutomaticPostingPlan => ({ errors: [message], commit: () => null });
const sourceEntry = (id: string, type = 'auto_purchase_invoice') => listJournalEntries().find(j => j.referenceType === type && j.referenceId === id && j.status === 'posted');

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
  allocations: Array<{ id: string; type: 'invoice' | 'purchase'; amount: number }> }): AutomaticPostingPlan {
  const payable = input.allocations.filter(a => sourceEntry(a.id, a.type === 'invoice' ? 'auto_purchase_invoice' : 'auto_direct_purchase')).reduce((sum, a) => sum + cents(a.amount), 0);
  return planAutomaticPosting({ referenceType: 'auto_supplier_payment', referenceId: input.id, date: input.date,
    description: 'Supplier payment ' + input.id, lines: [
      { key: 'accounts_payable', debit: payable / 100 },
      { key: 'legacy_settlement_clearing', debit: (cents(input.amount) - payable) / 100 },
      { key: input.method === 'cash' ? 'cash' : input.method === 'bank' ? 'bank' : 'payment_clearing', credit: input.amount },
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
