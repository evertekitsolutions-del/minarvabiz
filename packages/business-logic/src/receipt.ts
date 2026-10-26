/**
 * Plain-text / HTML receipt builders for sales and service orders.
 */

import type { Sale, ServiceOrder } from "@minarvabiz/types";
import { formatMoney } from "@minarvabiz/utils";
import { getShopProfile } from "./shop-profile";
import { SERVICE_TYPE_LABELS } from "./orders";
import { escapeHtml } from "./html";
import { getPrintSettings } from "./print-settings";
import { requestDesktopPrintHtml } from "./desktop-print";

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
  opts?: { shopName?: string; address?: string; phone?: string; autoPrint?: boolean }
): string {
  const text = buildSaleReceiptText(sale, opts);
  const autoPrint = opts?.autoPrint !== false;
  const escaped = escapeHtml(text);
  return `<!DOCTYPE html><html><head><title>${escapeHtml(sale.invoiceNumber)}</title>
<style>
  body { font-family: ui-monospace, monospace; font-size: 12px; padding: 16px; }
  pre { white-space: pre-wrap; }
  @media print { body { padding: 0; } }
</style></head><body><pre>${escaped}</pre>
${autoPrint ? "<script>window.onload=function(){window.print();}</script>" : ""}
</body></html>`;
}

export type ReceiptPrintAttempt =
  | { ok: true; state: "native-accepted" | "browser-window-opened" }
  | { ok: false; state: "blocked"; error: string };

/**
 * Dispatch a receipt print without creating or retrying any business transaction.
 * "native-accepted" means the OS print request was accepted, not that paper
 * physically emerged from the printer.
 */
async function requestReceiptPrint(
  html: string,
  autoPrintHtml: string,
  paper: "a4" | "thermal",
  dimensions: string,
): Promise<ReceiptPrintAttempt> {
  if (typeof window === "undefined") {
    return { ok: false, state: "blocked", error: "Printing requires an open app window" };
  }
  try {
    const native = requestDesktopPrintHtml(html, paper);
    if (native) {
      const result = await native;
      return result.ok
        ? { ok: true, state: "native-accepted" }
        : { ok: false, state: "blocked", error: result.error || "Printer rejected the request" };
    }
    // Must open synchronously before any await so browser popup protection
    // does not misclassify the print window as unsolicited.
    const popup = window.open("", "_blank", dimensions);
    if (!popup) {
      return {
        ok: false,
        state: "blocked",
        error: "Print window was blocked. Allow popups for this app, then retry the saved document.",
      };
    }
    try {
      popup.document.write(autoPrintHtml);
      popup.document.close();
    } catch (error) {
      try { popup.close(); } catch { /* popup may already be unavailable */ }
      throw error;
    }
    return { ok: true, state: "browser-window-opened" };
  } catch (error) {
    return { ok: false, state: "blocked", error: error instanceof Error ? error.message : String(error) };
  }
}

export function requestSaleReceiptPrint(
  sale: Sale,
  opts?: { shopName?: string; address?: string; phone?: string },
): Promise<ReceiptPrintAttempt> {
  const paper = getPrintSettings().defaultInvoicePaper;
  return requestReceiptPrint(
    buildSaleReceiptHtml(sale, { ...opts, autoPrint: false }),
    buildSaleReceiptHtml(sale, { ...opts, autoPrint: true }),
    paper,
    "width=400,height=600",
  );
}

export function requestOrderReceiptPrint(order: ServiceOrder): Promise<ReceiptPrintAttempt> {
  const paper = getPrintSettings().defaultInvoicePaper;
  return requestReceiptPrint(
    buildOrderReceiptHtml(order, { autoPrint: false }),
    buildOrderReceiptHtml(order, { autoPrint: true }),
    paper,
    "width=400,height=600",
  );
}

export function printSaleReceipt(
  sale: Sale,
  opts?: { shopName?: string; address?: string; phone?: string }
): Promise<ReceiptPrintAttempt> {
  return requestSaleReceiptPrint(sale, opts);
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

export function buildOrderReceiptHtml(order: ServiceOrder, opts?: { autoPrint?: boolean }): string {
  const text = buildOrderReceiptText(order);
  const escaped = escapeHtml(text);
  const autoPrint = opts?.autoPrint !== false;
  return `<!DOCTYPE html><html><head><title>${escapeHtml(order.orderNumber)}</title>
<style>body{font-family:ui-monospace,monospace;font-size:12px;padding:16px}pre{white-space:pre-wrap}@media print{body{padding:0}}</style>
</head><body><pre>${escaped}</pre>${autoPrint ? "<script>window.onload=function(){window.print();}</script>" : ""}</body></html>`;
}

export function printOrderReceipt(order: ServiceOrder): Promise<ReceiptPrintAttempt> {
  return requestOrderReceiptPrint(order);
}
