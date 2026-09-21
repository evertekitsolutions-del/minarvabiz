import type { LaundryOrder, PaymentMethod } from "@minarvabiz/types";
import { listJournalEntries, planAutomaticPosting, type AutomaticPostingPlan } from "./accounting-store";

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);
const invalid = (message: string): AutomaticPostingPlan => ({ errors: [message], commit: () => null });

function tenderKey(method: PaymentMethod): string {
  return method === "cash" ? "cash" : method === "bank" ? "bank" : "payment_clearing";
}

export function hasLaundryPosting(orderId: string): boolean {
  return listJournalEntries().some((entry) =>
    entry.referenceType === "auto_laundry" && entry.referenceId === orderId && entry.status === "posted"
  );
}

export function planLaundryPosting(order: LaundryOrder, paymentMethod: PaymentMethod): AutomaticPostingPlan {
  const values = [
    order.quantity, order.customerRate, order.supplierRate, order.totalCustomerCharge,
    order.totalSupplierCost, order.paidAmount, order.balanceAmount, order.profit,
  ];
  if (values.some((value) => !Number.isFinite(value))
    || order.quantity <= 0
    || [order.customerRate, order.supplierRate, order.totalCustomerCharge, order.totalSupplierCost, order.paidAmount, order.balanceAmount]
      .some((value) => value < 0)
    || ![order.customerRate, order.supplierRate, order.totalCustomerCharge, order.totalSupplierCost, order.paidAmount, order.balanceAmount]
      .every((value) => Number.isSafeInteger(cents(value)))
    || cents(order.totalCustomerCharge) !== cents(order.paidAmount) + cents(order.balanceAmount)
    || cents(order.totalCustomerCharge) !== cents(order.customerRate * order.quantity)
    || cents(order.totalSupplierCost) !== cents(order.supplierRate * order.quantity)
    || cents(order.profit) !== cents(order.totalCustomerCharge) - cents(order.totalSupplierCost)) {
    return invalid("Invalid laundry accounting amounts");
  }
  if (!["cash", "bank", "card", "upi", "online", "other"].includes(paymentMethod)) {
    return invalid("Invalid laundry payment method");
  }
  if (order.mode === "in_house_ironing" && cents(order.totalSupplierCost) !== 0) {
    return invalid("In-house ironing cannot have supplier cost");
  }
  if (order.mode === "outsourced" && order.totalSupplierCost > 0 && !order.supplierId) {
    return invalid("Supplier is required for outsourced laundry cost");
  }

  return planAutomaticPosting({
    referenceType: "auto_laundry",
    referenceId: order.id,
    date: order.createdAt,
    branchId: order.branchId ?? null,
    description: "Laundry order " + order.orderNumber,
    lines: [
      { key: tenderKey(paymentMethod), debit: order.paidAmount },
      { key: "accounts_receivable", debit: order.balanceAmount },
      { key: "laundry_revenue", credit: order.totalCustomerCharge },
      { key: "laundry_costs", debit: order.totalSupplierCost },
      { key: "accounts_payable", credit: order.totalSupplierCost },
    ],
  });
}


export function planLaundryCancellation(
  order: LaundryOrder,
  refundPaymentMethod?: PaymentMethod,
  supplierCostAction?: "keep" | "reverse"
): AutomaticPostingPlan {
  const original = listJournalEntries().find((entry) =>
    entry.referenceType === "auto_laundry" && entry.referenceId === order.id && entry.status === "posted"
  );
  if (!original) return invalid("Laundry order needs accounting reconciliation before cancellation");
  const values = [
    order.customerRate, order.supplierRate, order.totalCustomerCharge,
    order.totalSupplierCost, order.paidAmount, order.balanceAmount,
  ];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || !Number.isSafeInteger(cents(value)))
    || cents(order.totalCustomerCharge) !== cents(order.paidAmount) + cents(order.balanceAmount)) {
    return invalid("Laundry balances need reconciliation before cancellation");
  }
  if (order.paidAmount > 0 && (!refundPaymentMethod
    || !["cash", "bank", "card", "upi", "online", "other"].includes(refundPaymentMethod))) {
    return invalid("Select a valid laundry refund payment method");
  }
  if (order.totalSupplierCost > 0 && !["keep", "reverse"].includes(supplierCostAction ?? "")) {
    return invalid("Select how to handle the laundry supplier cost");
  }

  const lines: Array<{ key: string; debit?: number; credit?: number }> = [
    { key: "laundry_revenue", debit: order.totalCustomerCharge },
    { key: "accounts_receivable", credit: order.balanceAmount },
  ];
  if (order.paidAmount > 0 && refundPaymentMethod) {
    lines.push({ key: tenderKey(refundPaymentMethod), credit: order.paidAmount });
  }
  if (order.totalSupplierCost > 0 && supplierCostAction === "reverse") {
    lines.push(
      { key: "accounts_payable", debit: order.totalSupplierCost },
      { key: "laundry_costs", credit: order.totalSupplierCost },
    );
  }

  return planAutomaticPosting({
    referenceType: "auto_laundry_cancel",
    referenceId: order.id,
    date: new Date().toISOString(),
    branchId: order.branchId ?? null,
    description: "Cancel laundry order " + order.orderNumber,
    lines,
  });
}
