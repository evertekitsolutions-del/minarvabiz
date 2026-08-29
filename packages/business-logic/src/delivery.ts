/** Ready-to-deliver list + delivery challan text */
import type { ServiceOrder } from "@minarvabiz/types";
import * as ordersStore from "./orders-store";
import { formatMoney } from "@minarvabiz/utils";
import { getShopProfile } from "./shop-profile";

export function listReadyToDeliver(): ServiceOrder[] {
  return ordersStore.listOrders().filter((o) => o.status === "ready_to_deliver");
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
