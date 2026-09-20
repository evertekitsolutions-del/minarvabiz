import type { LaundryOrder, PaymentMethod } from "@minarvabiz/types";
import { planAutomaticPosting, type AutomaticPostingPlan } from "./accounting-store";

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);
const invalid = (message: string): AutomaticPostingPlan => ({ errors: [message], commit: () => null });

function tenderKey(method: PaymentMethod): string {
  return method === "cash" ? "cash" : method === "bank" ? "bank" : "payment_clearing";
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
