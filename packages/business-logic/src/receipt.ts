/**
 * Plain-text / HTML receipt builders for sales and service orders.
 */

import type { Sale, ServiceOrder } from "@minarvabiz/types";
import { formatMoney } from "@minarvabiz/utils";
import { getShopProfile } from "./shop-profile";
import { SERVICE_TYPE_LABELS } from "./orders";

export function buildSaleReceiptText(
  sale: Sale,
  opts?: { shopName?: string; address?: string; phone?: string }
): string {
  const profile = getShopProfile();
  const shop = opts?.shopName ?? profile.shopName;
  const address = opts?.address ?? profile.address;
  const phone = opts?.phone ?? profile.phone;
  const lines: string[] = [
    shop,
    address,
    phone ? `Tel: ${phone}` : "",
    profile.gstin ? `GSTIN: ${profile.gstin}` : "",
    "--------------------------------",
    `Invoice: ${sale.invoiceNumber}`,
    `Date: ${new Date(sale.saleDate).toLocaleString("en-IN")}`,
    sale.customerName ? `Customer: ${sale.customerName}` : "Customer: Walk-in",
    "--------------------------------",
  ];
  for (const item of sale.items) {
    lines.push(
      `${item.productName} x${item.quantity}`,
      `  ${formatMoney(item.unitPrice)} = ${formatMoney(item.lineTotal)}`
    );
  }
  lines.push("--------------------------------");
  lines.push(`Subtotal: ${formatMoney(sale.subtotal)}`);
  if (sale.discountAmount) lines.push(`Discount: ${formatMoney(sale.discountAmount)}`);
  if (sale.taxAmount) lines.push(`Tax: ${formatMoney(sale.taxAmount)}`);
  lines.push(`TOTAL: ${formatMoney(sale.total)}`);
  lines.push(`Paid: ${formatMoney(sale.paidAmount)}`);
  if (sale.balanceAmount > 0) lines.push(`Balance: ${formatMoney(sale.balanceAmount)}`);
  lines.push("--------------------------------");
  lines.push(profile.receiptFooter || "Thank you!");
  return lines.filter((l) => l !== undefined && l !== "").join("\n");
}

export function buildSaleReceiptHtml(
  sale: Sale,
  opts?: { shopName?: string; address?: string; phone?: string }
): string {
  const text = buildSaleReceiptText(sale, opts);
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html><html><head><title>${sale.invoiceNumber}</title>
<style>
  body { font-family: ui-monospace, monospace; font-size: 12px; padding: 16px; }
  pre { white-space: pre-wrap; }
  @media print { body { padding: 0; } }
</style></head><body><pre>${escaped}</pre>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
}

export function printSaleReceipt(
  sale: Sale,
  opts?: { shopName?: string; address?: string; phone?: string }
): void {
  if (typeof window === "undefined") return;
  const html = buildSaleReceiptHtml(sale, opts);
  const w = window.open("", "_blank", "width=400,height=600");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

export function buildOrderReceiptText(order: ServiceOrder): string {
  const shop = getShopProfile();
  const lines: string[] = [
    shop.shopName,
    shop.address,
    shop.phone ? `Tel: ${shop.phone}` : "",
    shop.gstin ? `GSTIN: ${shop.gstin}` : "",
    "--------------------------------",
    `Order: ${order.orderNumber}`,
    `Date: ${new Date(order.orderDate).toLocaleString("en-IN")}`,
    order.customerName ? `Customer: ${order.customerName}` : "",
    `Service: ${SERVICE_TYPE_LABELS[order.serviceType] ?? order.serviceType}`,
    `Status: ${order.status}`,
    "--------------------------------",
    `Price: ${formatMoney(order.price)}`,
    order.discount ? `Discount: ${formatMoney(order.discount)}` : "",
    `Advance: ${formatMoney(order.advance)}`,
    `Balance: ${formatMoney(order.balance)}`,
    "--------------------------------",
    shop.receiptFooter || "Thank you!",
  ];
  return lines.filter(Boolean).join("\n");
}

export function printOrderReceipt(order: ServiceOrder): void {
  if (typeof window === "undefined") return;
  const text = buildOrderReceiptText(order);
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const html = `<!DOCTYPE html><html><head><title>${order.orderNumber}</title>
<style>body{font-family:ui-monospace,monospace;font-size:12px;padding:16px}pre{white-space:pre-wrap}@media print{body{padding:0}}</style>
</head><body><pre>${escaped}</pre><script>window.onload=function(){window.print();}</script></body></html>`;
  const w = window.open("", "_blank", "width=400,height=600");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
