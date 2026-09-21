import type { ServiceOrder } from "@minarvabiz/types";
import { planAutomaticPosting, type AutomaticPostingPlan } from "./accounting-store";

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);
const invalid = (message: string): AutomaticPostingPlan => ({ errors: [message], commit: () => null });

export function planServiceOrderPosting(order: ServiceOrder): AutomaticPostingPlan {
  const values = [order.price, order.advance, order.balance];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || !Number.isSafeInteger(cents(value)))
    || cents(order.price) !== cents(order.advance) + cents(order.balance)) {
    return invalid("Invalid service order accounting amounts");
  }
  return planAutomaticPosting({
    referenceType: "auto_service_order",
    referenceId: order.id,
    date: order.orderDate,
    branchId: order.branchId ?? null,
    description: "Service order " + order.orderNumber,
    lines: [
      { key: "cash", debit: order.advance },
      { key: "accounts_receivable", debit: order.balance },
      { key: "service_revenue", credit: order.price },
    ],
  });
}
