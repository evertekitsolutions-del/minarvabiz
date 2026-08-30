/**
 * Message templates for WhatsApp / SMS (manual send only)
 */
import type { ServiceOrder, Customer } from "@minarvabiz/types";
import { formatMoney } from "@minarvabiz/utils";
import { getShopProfile } from "./shop-profile";
import { SERVICE_TYPE_LABELS } from "./orders";

export type TemplateId =
  | "order_received"
  | "order_processing"
  | "trial_ready"
  | "order_ready"
  | "delivery_reminder"
  | "payment_due"
  | "payment_received"
  | "low_stock_internal";

export function renderTemplate(
  id: TemplateId,
  data: Record<string, string>
): { title: string; body: string } {
  const shop = getShopProfile().shopName || "Minarva Biz";
  switch (id) {
    case "order_received":
      return {
        title: "Order received",
        body: `Dear ${data.customerName || "Customer"}, we received your ${data.serviceType || "order"} (${data.orderNumber}). Expected delivery: ${data.deliveryDate || "TBD"}. — ${shop}`,
      };
    case "order_processing":
      return {
        title: "Order processing",
        body: `Dear ${data.customerName || "Customer"}, your order ${data.orderNumber} is now being processed at ${shop}.`,
      };
    case "trial_ready":
      return {
        title: "Trial ready",
        body: `Dear ${data.customerName || "Customer"}, your trial for order ${data.orderNumber} is ready. Please visit ${shop}.`,
      };
    case "order_ready":
      return {
        title: "Ready for pickup",
        body: `Dear ${data.customerName || "Customer"}, your order ${data.orderNumber} is ready for pickup/delivery at ${shop}. Balance: ${data.balance || "—"}.`,
      };
    case "delivery_reminder":
      return {
        title: "Delivery reminder",
        body: `Dear ${data.customerName || "Customer"}, reminder: order ${data.orderNumber} delivery/pickup on ${data.deliveryDate || "scheduled date"}. — ${shop}`,
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

export function templateForOrder(
  id: TemplateId,
  order: ServiceOrder,
  customer?: Customer | null
): { title: string; body: string } {
  return renderTemplate(id, {
    customerName: customer?.name || order.customerName || "",
    orderNumber: order.orderNumber,
    serviceType: SERVICE_TYPE_LABELS[order.serviceType] || order.serviceType,
    deliveryDate: order.deliveryDate || "",
    balance: formatMoney(order.balance),
  });
}

export const TEMPLATE_OPTIONS: { id: TemplateId; label: string }[] = [
  { id: "order_received", label: "Order received" },
  { id: "order_processing", label: "Processing" },
  { id: "trial_ready", label: "Trial ready" },
  { id: "order_ready", label: "Ready for pickup" },
  { id: "delivery_reminder", label: "Delivery reminder" },
  { id: "payment_due", label: "Payment reminder" },
];


export function templatePaymentDue(customer: Customer | string, amount?: string) {
  const name = typeof customer === "string" ? customer : customer.name;
  const amt =
    amount ??
    (typeof customer === "object" ? formatMoney(customer.outstandingBalance || 0) : "");
  return renderTemplate("payment_due", { customerName: name, amount: amt });
}
export function templatePaymentReceived(customer: Customer | string, amount: number | string) {
  const name = typeof customer === "string" ? customer : customer.name;
  const amt = typeof amount === "number" ? formatMoney(amount) : amount;
  return renderTemplate("payment_received", { customerName: name, amount: amt });
}
export function templateFromOrderReady(order: ServiceOrder, customer?: Customer | null) {
  return templateForOrder("order_ready", order, customer);
}
