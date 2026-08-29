/**
 * Service order calculations — tailoring, wedding, bulk, t-shirt.
 */

import { roundMoney, subtractMoney } from "@minarvabiz/utils";
import type { ServiceType, OrderStatus, TshirtDetails } from "@minarvabiz/types";
import { calculateOrderProfit } from "./profit";

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  ladies_tailoring: "Ladies Tailoring",
  gents_tailoring: "Gents Tailoring",
  ladies_alteration: "Ladies Alteration",
  gents_alteration: "Gents Alteration",
  wedding_dress: "Custom Wedding Dress",
  wholesale: "Wholesale Order",
  uniform: "Uniform Order",
  tshirt_printing: "T-shirt Printing",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  ready_to_deliver: "Ready to Deliver",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const ORDER_STATUS_FLOW: OrderStatus[] = [
  "pending",
  "processing",
  "ready_to_deliver",
  "delivered",
];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (to === "cancelled") return from !== "delivered" && from !== "cancelled";
  if (from === "cancelled" || from === "delivered") return false;
  const fi = ORDER_STATUS_FLOW.indexOf(from);
  const ti = ORDER_STATUS_FLOW.indexOf(to);
  return ti >= fi;
}

export interface OrderPricingInput {
  serviceType: ServiceType;
  price: number;
  discount?: number;
  advance?: number;
  quantity?: number;
  unitPrice?: number;
  bulkDiscount?: number;
  externalMaterialCost?: number;
  orderExpensesTotal?: number;
  tshirt?: TshirtDetails | null;
}

export interface OrderPricingResult {
  price: number;
  discount: number;
  netPrice: number;
  advance: number;
  balance: number;
  quantity: number;
  externalMaterialCost: number;
  orderExpensesTotal: number;
  grossProfit: number;
  profitMarginPercent: number;
}

export function calculateOrderPricing(input: OrderPricingInput): OrderPricingResult {
  let price = roundMoney(input.price);
  let quantity = input.quantity ?? 1;
  let discount = roundMoney(input.discount ?? 0);

  if (
    (input.serviceType === "wholesale" || input.serviceType === "uniform") &&
    input.unitPrice != null &&
    input.quantity != null
  ) {
    quantity = input.quantity;
    const gross = roundMoney(input.unitPrice * quantity);
    const bulkDisc = roundMoney(input.bulkDiscount ?? 0);
    price = subtractMoney(gross, bulkDisc);
    discount = bulkDisc;
  }

  if (input.serviceType === "tshirt_printing" && input.tshirt) {
    quantity = input.tshirt.quantity;
    price = roundMoney(input.tshirt.customerPrice);
  }

  // For bulk, price already has bulk discount applied
  const finalNet =
    input.serviceType === "wholesale" || input.serviceType === "uniform"
      ? price
      : subtractMoney(price, Math.min(discount, price));

  const advance = roundMoney(Math.min(input.advance ?? 0, finalNet));
  const balance = subtractMoney(finalNet, advance);

  const externalMaterialCost = roundMoney(input.externalMaterialCost ?? 0);
  let orderExpensesTotal = roundMoney(input.orderExpensesTotal ?? 0);

  if (input.serviceType === "tshirt_printing" && input.tshirt) {
    orderExpensesTotal = roundMoney(
      orderExpensesTotal + (input.tshirt.printingCost ?? 0)
    );
  }

  const profit = calculateOrderProfit({
    revenue: finalNet,
    materialCost: externalMaterialCost,
    orderSpecificExpenses: orderExpensesTotal,
  });

  return {
    price: finalNet,
    discount,
    netPrice: finalNet,
    advance,
    balance,
    quantity,
    externalMaterialCost,
    orderExpensesTotal,
    grossProfit: profit.grossProfit,
    profitMarginPercent: profit.profitMarginPercent,
  };
}

export function nextOrderNumber(lastNumber: string | null, prefix = "ORD"): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const day = String(new Date().getDate()).padStart(2, "0");
  let seq = 1;
  if (lastNumber) {
    const parts = lastNumber.split("-");
    const last = parseInt(parts[parts.length - 1] ?? "0", 10);
    if (!Number.isNaN(last)) seq = last + 1;
  }
  return `${prefix}-${year}${month}${day}-${String(seq).padStart(3, "0")}`;
}

export function validateOrderInput(input: {
  customerId?: string | null;
  serviceType: ServiceType;
  price: number;
  deliveryDate?: string | null;
  tshirt?: TshirtDetails | null;
}): string[] {
  const errors: string[] = [];
  if (!input.customerId) errors.push("Customer is required");
  if (input.price < 0) errors.push("Price cannot be negative");
  if (input.serviceType === "tshirt_printing") {
    if (!input.tshirt || input.tshirt.quantity <= 0) {
      errors.push("T-shirt quantity must be positive");
    }
  }
  return errors;
}
