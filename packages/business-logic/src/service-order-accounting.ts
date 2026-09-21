import type { PaymentMethod, ServiceOrder } from "@minarvabiz/types";
import { getAccount, listJournalEntries, planAutomaticPosting, type AutomaticPostingPlan } from "./accounting-store";

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);
const invalid = (message: string): AutomaticPostingPlan => ({ errors: [message], commit: () => null });

function tenderKey(method: PaymentMethod): string {
  return method === "cash" ? "cash" : method === "bank" ? "bank" : "payment_clearing";
}

export function planServiceOrderPosting(order: ServiceOrder, advancePaymentMethod: PaymentMethod = "cash"): AutomaticPostingPlan {
  const values = [order.price, order.advance, order.balance];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || !Number.isSafeInteger(cents(value)))
    || cents(order.price) !== cents(order.advance) + cents(order.balance)) {
    return invalid("Invalid service order accounting amounts");
  }
  if (!["cash", "bank", "card", "upi", "online", "other"].includes(advancePaymentMethod)) {
    return invalid("Invalid service order advance payment method");
  }
  return planAutomaticPosting({
    referenceType: "auto_service_order",
    referenceId: order.id,
    date: order.orderDate,
    branchId: order.branchId ?? null,
    description: "Service order " + order.orderNumber,
    lines: [
      { key: tenderKey(advancePaymentMethod), debit: order.advance },
      { key: "accounts_receivable", debit: order.balance },
      { key: "service_revenue", credit: order.price },
    ],
  });
}


export function planServiceOrderCancellation(order: ServiceOrder): AutomaticPostingPlan {
  const original = listJournalEntries().find((entry) =>
    entry.referenceType === "auto_service_order" && entry.referenceId === order.id && entry.status === "posted"
  );
  if (!original) return invalid("Service order needs accounting reconciliation before cancellation");
  const lines = original.lines.map((line) => {
    const key = getAccount(line.accountId)?.systemKey;
    return key ? { key, debit: line.credit, credit: line.debit } : null;
  });
  if (lines.some((line) => !line)) return invalid("Service order posting accounts need reconciliation");
  return planAutomaticPosting({
    referenceType: "auto_service_order_cancel",
    referenceId: order.id,
    date: new Date().toISOString(),
    branchId: order.branchId ?? null,
    description: "Cancel service order " + order.orderNumber,
    lines: lines as Array<{ key: string; debit: number; credit: number }>,
  });
}
