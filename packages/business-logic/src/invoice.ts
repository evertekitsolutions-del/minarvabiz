/**
 * Professional invoice HTML for thermal / A4 / print-preview.
 */

import type { Sale, ServiceOrder } from "@minarvabiz/types";
import { formatMoney } from "@minarvabiz/utils";
import { getShopProfile } from "./shop-profile";
import { getTaxConfig } from "./tax-config";

export function buildSaleInvoiceHtml(sale: Sale, opts?: { paper?: "a4" | "thermal" }): string {
  const shop = getShopProfile();
  const tax = getTaxConfig();
  const paper = opts?.paper ?? "a4";
  const width = paper === "thermal" ? "80mm" : "210mm";
  const rows = sale.items
    .map(
      (i) =>
        `<tr>
          <td>${escapeHtml(i.productName)}</td>
          <td class="r">${i.quantity}</td>
          <td class="r">${formatMoney(i.unitPrice)}</td>
          <td class="r">${formatMoney(i.lineTotal)}</td>
        </tr>`
    )
    .join("");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${escapeHtml(sale.invoiceNumber)}</title>
<style>
  body{font-family:system-ui,sans-serif;margin:0;padding:16px;color:#0f172a}
  .sheet{max-width:${width};margin:0 auto}
  h1{font-size:18px;margin:0 0 4px}
  .muted{color:#64748b;font-size:12px}
  table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
  th,td{border-bottom:1px solid #e2e8f0;padding:6px 4px;text-align:left}
  .r{text-align:right}
  .tot{font-weight:700;font-size:14px}
  .brand{display:flex;justify-content:space-between;align-items:flex-start}
  @media print{body{padding:0}}
</style></head><body>
<div class="sheet">
  <div class="brand">
    <div>
      <h1>${escapeHtml(shop.shopName || "Minarva Biz")}</h1>
      <div class="muted">${escapeHtml(shop.address || "")}</div>
      <div class="muted">${shop.phone ? "Tel: " + escapeHtml(shop.phone) : ""}</div>
      ${tax.enableGst && (shop.gstin || tax.gstin) ? `<div class="muted">GSTIN: ${escapeHtml(shop.gstin || tax.gstin)}</div>` : ""}
    </div>
    <div class="muted" style="text-align:right">
      <div><strong>INVOICE</strong></div>
      <div>${escapeHtml(sale.invoiceNumber)}</div>
      <div>${new Date(sale.saleDate).toLocaleString("en-IN")}</div>
    </div>
  </div>
  <p class="muted">Bill to: <strong>${escapeHtml(sale.customerName || "Walk-in")}</strong></p>
  <table>
    <thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table>
    <tr><td>Subtotal</td><td class="r">${formatMoney(sale.subtotal)}</td></tr>
    ${sale.discountAmount ? `<tr><td>Discount</td><td class="r">${formatMoney(sale.discountAmount)}</td></tr>` : ""}
    ${sale.taxAmount ? `<tr><td>Tax</td><td class="r">${formatMoney(sale.taxAmount)}</td></tr>` : ""}
    <tr class="tot"><td>Total</td><td class="r">${formatMoney(sale.total)}</td></tr>
    <tr><td>Paid</td><td class="r">${formatMoney(sale.paidAmount)}</td></tr>
    ${sale.balanceAmount > 0 ? `<tr><td>Balance</td><td class="r">${formatMoney(sale.balanceAmount)}</td></tr>` : ""}
  </table>
  <p class="muted" style="margin-top:16px">${escapeHtml(shop.receiptFooter || "Thank you!")}</p>
</div>
<script>window.onload=function(){window.print&&window.print()}</script>
</body></html>`;
}

export function printSaleInvoice(sale: Sale, paper: "a4" | "thermal" = "a4") {
  if (typeof window === "undefined") return;
  const html = buildSaleInvoiceHtml(sale, { paper });
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

export function buildOrderInvoiceHtml(order: ServiceOrder): string {
  const shop = getShopProfile();
  return `<!DOCTYPE html><html><head><title>${escapeHtml(order.orderNumber)}</title>
<style>body{font-family:system-ui;padding:16px}table{width:100%;border-collapse:collapse}
td,th{border-bottom:1px solid #e2e8f0;padding:6px;text-align:left}</style></head>
<body>
<h1>${escapeHtml(shop.shopName)}</h1>
<p>Order ${escapeHtml(order.orderNumber)} · ${escapeHtml(order.customerName || "")}</p>
<p>Service: ${escapeHtml(String(order.serviceType))} · Status: ${escapeHtml(String(order.status))}</p>
<table>
<tr><td>Price</td><td>${formatMoney(order.price)}</td></tr>
<tr><td>Discount</td><td>${formatMoney(order.discount)}</td></tr>
<tr><td>Advance</td><td>${formatMoney(order.advance)}</td></tr>
<tr><td>Balance</td><td>${formatMoney(order.balance)}</td></tr>
<tr><td>Material cost</td><td>${formatMoney(order.externalMaterialCost)}</td></tr>
<tr><td>Order expenses</td><td>${formatMoney(order.orderExpensesTotal)}</td></tr>
</table>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
