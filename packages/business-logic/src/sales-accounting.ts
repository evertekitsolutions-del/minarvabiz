import type { Sale, SaleReturn, Payment, PaymentMethod } from '@minarvabiz/types';
import { calculateLineItem } from '@minarvabiz/billing';
import {
  addMinorUnits,
  fromMinorUnits,
  multiplyMinorByQuantity,
  subtractMinorUnits,
  toMinorUnits,
  nowISO,
  type MoneyMinor,
} from '@minarvabiz/utils';
import { hasSalePosting, planAutomaticPosting, type AutomaticPostingLine, type AutomaticPostingPlan } from './accounting-store';

const money = (n: number) => fromMinorUnits(toMinorUnits(n));
function tenderKey(method: PaymentMethod): string {
  return method === 'cash' ? 'cash' : method === 'bank' ? 'bank' : 'payment_clearing';
}
const invalid = (message: string): AutomaticPostingPlan => ({ errors: [message], commit: () => null });

export function planSalePosting(sale: Sale, tenders: Array<{ method: PaymentMethod; amount: number }>, credit: number): AutomaticPostingPlan {
  const amounts = [sale.total, sale.taxAmount, sale.paidAmount, sale.balanceAmount, credit, ...sale.items.flatMap(i => [i.quantity, i.costPrice, i.lineTotal])];
  if (amounts.some(n => !Number.isFinite(n) || n < 0) || sale.taxAmount > sale.total) return invalid('Invalid sale accounting amounts');

  let paidMinor: MoneyMinor;
  let creditMinor: MoneyMinor;
  let saleTotalMinor: MoneyMinor;
  let taxMinor: MoneyMinor;
  try {
    paidMinor = toMinorUnits(sale.paidAmount);
    creditMinor = toMinorUnits(credit);
    saleTotalMinor = toMinorUnits(sale.total);
    taxMinor = toMinorUnits(sale.taxAmount);
  } catch {
    return invalid('Invalid sale accounting amounts');
  }

  const lines: AutomaticPostingLine[] = [];
  let remainingMinor = subtractMinorUnits(paidMinor, creditMinor);
  if (remainingMinor < 0) return invalid('Exchange credit exceeds paid amount');

  for (const tender of tenders) {
    if (!['cash', 'bank', 'card', 'upi', 'online', 'other'].includes(tender.method) || !Number.isFinite(tender.amount) || tender.amount < 0) {
      return invalid('Invalid sale tender');
    }
    const tenderMinor = toMinorUnits(tender.amount);
    const appliedMinor = Math.min(remainingMinor, tenderMinor);
    lines.push({ key: tenderKey(tender.method), debit: fromMinorUnits(appliedMinor) });
    remainingMinor = subtractMinorUnits(remainingMinor, appliedMinor);
  }
  if (remainingMinor !== 0) return invalid('Sale tender allocation does not match paid amount');

  let costMinor: MoneyMinor = 0;
  for (const item of sale.items) {
    costMinor = addMinorUnits(costMinor, multiplyMinorByQuantity(toMinorUnits(item.costPrice), item.quantity));
  }
  const revenueMinor = subtractMinorUnits(saleTotalMinor, taxMinor);
  const cost = fromMinorUnits(costMinor);

  lines.push(
    { key: 'exchange_credit', debit: fromMinorUnits(creditMinor) },
    { key: 'accounts_receivable', debit: sale.balanceAmount },
    { key: 'product_sales', credit: fromMinorUnits(revenueMinor) },
    { key: 'tax_payable', credit: fromMinorUnits(taxMinor) },
    { key: 'cogs', debit: cost },
    { key: 'inventory_asset', credit: cost }
  );
  return planAutomaticPosting({ referenceType: 'auto_sale', referenceId: sale.id, date: sale.saleDate,
    description: 'Sale ' + sale.invoiceNumber, branchId: sale.branchId, lines });
}

export function planCollectionPosting(
  payment: Payment,
  allocations: Array<{ sale: Sale; amount: number }>,
  additionalPostedReceivable = 0
): AutomaticPostingPlan {
  if (!Number.isFinite(additionalPostedReceivable) || additionalPostedReceivable < 0) return invalid('Invalid additional receivable allocation');
  let saleReceivableMinor: MoneyMinor = 0;
  for (const allocation of allocations.filter(a => hasSalePosting(a.sale.id))) {
    saleReceivableMinor = addMinorUnits(saleReceivableMinor, toMinorUnits(allocation.amount));
  }
  const receivableMinor = addMinorUnits(saleReceivableMinor, toMinorUnits(additionalPostedReceivable));
  const paymentMinor = toMinorUnits(payment.amount);
  return planAutomaticPosting({ referenceType: 'auto_collection', referenceId: payment.id, date: payment.paidAt,
    description: 'Customer collection ' + (payment.notes ?? payment.id), lines: [
      { key: tenderKey(payment.method), debit: fromMinorUnits(paymentMinor) },
      { key: 'accounts_receivable', credit: fromMinorUnits(receivableMinor) },
      { key: 'legacy_settlement_clearing', credit: fromMinorUnits(subtractMinorUnits(paymentMinor, receivableMinor)) },
    ] });
}

export function planReturnPosting(sale: Sale, ret: SaleReturn, history: SaleReturn[], paidRefund: number, receivableReduction: number): AutomaticPostingPlan {
  const settlementKey = ret.resolution === 'exchange' ? 'exchange_credit' : tenderKey(ret.refundMethod);
  const lines: AutomaticPostingLine[] = [{ key: settlementKey, credit: paidRefund }];
  if (!hasSalePosting(sale.id)) {
    // Historic invoice revenue/receivables were never posted. Do not invent a reversal.
    lines.push({ key: 'legacy_settlement_clearing', debit: paidRefund });
  } else {
    let taxCents = 0, costCents = 0;
    const previous = history.filter(r => r.saleId === sale.id && r.status === 'completed').flatMap(r => r.items);
    for (const item of ret.items) {
      const original = sale.items.find(i => i.id === item.saleItemId)!;
      const prior = previous.filter(i => i.saleItemId === original.id);
      const returnedValue = prior.reduce((sum, i) => sum + cents(i.refundAmount), 0);
      const originalTax = cents(calculateLineItem(original).taxAmount);
      const lineValue = cents(original.lineTotal);
      if (lineValue > 0) taxCents += Math.round(originalTax * (returnedValue + cents(item.refundAmount)) / lineValue) - Math.round(originalTax * returnedValue / lineValue);
      if (item.restock) {
        const restoredQty = prior.filter(i => i.restock).reduce((sum, i) => sum + i.quantity, 0);
        const originalCost = cents(original.costPrice * original.quantity);
        costCents += Math.round(originalCost * (restoredQty + item.quantity) / original.quantity) - Math.round(originalCost * restoredQty / original.quantity);
      }
    }
    lines.push({ key: 'product_sales', debit: money(ret.totalRefund - taxCents / 100) }, { key: 'tax_payable', debit: taxCents / 100 },
      { key: 'accounts_receivable', credit: receivableReduction }, { key: 'inventory_asset', debit: costCents / 100 }, { key: 'cogs', credit: costCents / 100 });
  }
  return planAutomaticPosting({ referenceType: 'auto_return', referenceId: ret.id, date: ret.createdAt,
    description: (ret.resolution === 'exchange' ? 'Exchange return ' : 'Return ') + ret.returnNumber,
    branchId: sale.branchId, lines });
}

export function planExchangeRefundPosting(id: string, amount: number, method: PaymentMethod): AutomaticPostingPlan {
  return planAutomaticPosting({ referenceType: 'auto_exchange_refund', referenceId: id, date: nowISO(), description: 'Exchange excess credit refund',
    lines: [{ key: 'exchange_credit', debit: amount }, { key: tenderKey(method), credit: amount }] });
}
