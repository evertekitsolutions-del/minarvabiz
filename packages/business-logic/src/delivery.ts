/**
 * Delivery / pickup workflow for service orders
 */
import type { ServiceOrder, UUID } from "@minarvabiz/types";
import { nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import * as ordersStore from "./orders-store";
import { formatMoney } from "@minarvabiz/utils";
import { getShopProfile } from "./shop-profile";
import { auditAction } from "./audit-actions";

export type DeliveryFilter = "all" | "due_today" | "overdue" | "ready" | "delivered";

export function listReadyToDeliver(): ServiceOrder[] {
  return ordersStore.listOrders().filter((o) => o.status === "ready_to_deliver");
}

export function listOrdersForDelivery(filter: DeliveryFilter = "all"): ServiceOrder[] {
  const today = new Date().toISOString().slice(0, 10);
  let list = ordersStore.listOrders().filter((o) => o.status !== "cancelled");
  switch (filter) {
    case "due_today":
      list = list.filter((o) => o.deliveryDate === today && o.status !== "delivered");
      break;
    case "overdue":
      list = list.filter(
        (o) => o.deliveryDate && o.deliveryDate < today && o.status !== "delivered"
      );
      break;
    case "ready":
      list = list.filter((o) => o.status === "ready_to_deliver");
      break;
    case "delivered":
      list = list.filter((o) => o.status === "delivered");
      break;
  }
  return list;
}

export function markDelivered(
  orderId: UUID,
  opts?: { deliveredBy?: string; deliveryCharge?: number; address?: string }
): { order: ServiceOrder | null; error?: string } {
  assertPermission("orders.manage");
  const order = ordersStore.getOrder(orderId);
  if (!order) return { order: null, error: "Order not found" };
  if (order.status === "delivered") return { order, error: "Already delivered" };
  if (order.status !== "ready_to_deliver") {
    return { order: null, error: `Cannot deliver from status ${order.status}; mark ready first` };
  }
  const from = order.status;
  const result = ordersStore.updateOrderStatus(orderId, "delivered");
  if (result.error) return { order: null, error: result.error };
  const o = result.order!;
  if (opts?.deliveredBy) (o as ServiceOrder & { deliveredBy?: string }).deliveredBy = opts.deliveredBy;
  if (opts?.deliveryCharge != null) (o as ServiceOrder & { deliveryCharge?: number }).deliveryCharge = opts.deliveryCharge;
  if (opts?.address) (o as ServiceOrder & { deliveryAddress?: string }).deliveryAddress = opts.address;
  o.updatedAt = nowISO();
  auditAction("order.deliver", "orders", orderId, { status: from }, { status: "delivered", ...opts });
  touchPersistence();
  return { order: o };
}

export function buildDeliveryChallan(orders: ServiceOrder[]): string {
  const shop = getShopProfile();
  const lines = [
    shop.shopName,
    "DELIVERY CHALLAN",
    new Date().toLocaleString("en-IN"),
    "--------------------------------",
  ];
  for (const o of orders) {
    lines.push(`${o.orderNumber} | ${o.customerName || "—"} | ${formatMoney(o.balance)}`);
  }
  lines.push("--------------------------------");
  lines.push(`Total orders: ${orders.length}`);
  return lines.join("\n");
}

export function printDeliveryChallan(orders: ServiceOrder[]): void {
  if (typeof window === "undefined") return;
  const text = buildDeliveryChallan(orders);
  const html = `<!DOCTYPE html><html><body><pre>${text.replace(/</g, "&lt;")}</pre>
<script>window.onload=function(){window.print();}</script></body></html>`;
  const w = window.open("", "_blank", "width=480,height=640");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
