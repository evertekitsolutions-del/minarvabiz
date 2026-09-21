import type { PaymentMethod, ServiceOrder } from "@minarvabiz/types";
import { listJournalEntries, planAutomaticPosting, type AutomaticPostingPlan } from "./accounting-store";

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);
const invalid = (message: string): AutomaticPostingPlan => ({ errors: [message], commit: () => null });

function tenderKey(method: PaymentMethod): string {
  return method === "cash" ? "cash" : method === "bank" ? "bank" : "payment_clearing";
}

export function hasServiceOrderPosting(orderId: string): boolean {
  return listJournalEntries().some((entry) => entry.referenceType === "auto_service_order" && entry.referenceId === orderId && entry.status === "posted");
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


export function planServiceOrderCancellation(
  order: ServiceOrder,
  refundPaymentMethod?: PaymentMethod
): AutomaticPostingPlan {
  const original = listJournalEntries().find((entry) =>
    entry.referenceType === "auto_service_order" && entry.referenceId === order.id && entry.status === "posted"
  );
  if (!original) return invalid("Service order needs accounting reconciliation before cancellation");
  const values = [order.price, order.advance, order.balance];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || !Number.isSafeInteger(cents(value)))
    || cents(order.price) !== cents(order.advance) + cents(order.balance)) {
    return invalid("Service order balances need reconciliation before cancellation");
  }
  if (order.advance > 0 && (!refundPaymentMethod
    || !["cash", "bank", "card", "upi", "online", "other"].includes(refundPaymentMethod))) {
    return invalid("Select a valid refund payment method for the service-order advance");
  }

  const lines: Array<{ key: string; debit?: number; credit?: number }> = [
    { key: "service_revenue", debit: order.price },
    { key: "accounts_receivable", credit: order.balance },
  ];
  if (order.advance > 0 && refundPaymentMethod) {
    lines.push({ key: tenderKey(refundPaymentMethod), credit: order.advance });
  }
  return planAutomaticPosting({
    referenceType: "auto_service_order_cancel",
    referenceId: order.id,
    date: new Date().toISOString(),
    branchId: order.branchId ?? null,
    description: "Cancel service order " + order.orderNumber,
    lines,
  });
}
