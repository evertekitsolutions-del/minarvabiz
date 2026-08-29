/**
 * Message templates for SMS / WhatsApp / in-app (provider-agnostic).
 */

import type { ServiceOrder, Customer } from "@minarvabiz/types";
import { formatMoney } from "@minarvabiz/utils";
import { getShopProfile } from "./shop-profile";
import { SERVICE_TYPE_LABELS } from "./orders";

export type TemplateId =
  | "order_ready"
  | "order_received"
  | "payment_due"
  | "payment_received"
  | "low_stock_internal";

export function renderTemplate(
  id: TemplateId,
  data: Record<string, string>
): { title: string; body: string } {
  const shop = getShopProfile().shopName || "Minarva Biz";
  switch (id) {
    case "order_ready":
      return {
        title: "Order ready",
        body: `Dear ${data.customerName || "Customer"}, your order ${data.orderNumber} is ready for delivery at ${shop}. Balance: ${data.balance || "—"}.`,
      };
    case "order_received":
      return {
        title: "Order received",
        body: `Dear ${data.customerName || "Customer"}, we received your ${data.serviceType || "order"} (${data.orderNumber}). Expected delivery: ${data.deliveryDate || "TBD"}. — ${shop}`,
      };
    case "payment_due":
      return {
        title: "Payment reminder",
        body: `Dear ${data.customerName || "Customer"}, outstanding balance ${data.amount} is due at ${shop}. Please contact us to settle.`,
      };
    case "payment_received":
      return {
        title: "Payment received",
        body: `Dear ${data.customerName || "Customer"}, we received ${data.amount}. Thank you! — ${shop}`,
      };
    case "low_stock_internal":
      return {
        title: "Low stock",
        body: `${data.productName} is low (${data.stock} left, min ${data.min}).`,
      };
    default:
      return { title: "Notification", body: data.body || "" };
  }
}

export function templateFromOrderReady(order: ServiceOrder) {
  return renderTemplate("order_ready", {
    customerName: order.customerName || "",
    orderNumber: order.orderNumber,
    balance: formatMoney(order.balance),
  });
}

export function templateFromOrderReceived(order: ServiceOrder) {
  return renderTemplate("order_received", {
    customerName: order.customerName || "",
    orderNumber: order.orderNumber,
    serviceType: SERVICE_TYPE_LABELS[order.serviceType] ?? order.serviceType,
    deliveryDate: order.deliveryDate
      ? new Date(order.deliveryDate).toLocaleDateString("en-IN")
      : "",
  });
}

export function templatePaymentDue(customer: Customer) {
  return renderTemplate("payment_due", {
    customerName: customer.name,
    amount: formatMoney(customer.outstandingBalance),
  });
}

export function templatePaymentReceived(customer: Customer, amount: number) {
  return renderTemplate("payment_received", {
    customerName: customer.name,
    amount: formatMoney(amount),
  });
}
