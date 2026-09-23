/**
 * Professional invoice HTML for thermal / A4 / print-preview.
 */

import type { Sale, ServiceOrder } from "@minarvabiz/types";
import { formatMoney } from "@minarvabiz/utils";
import { getShopProfile } from "./shop-profile";
import { getTaxConfig } from "./tax-config";
import { getPrintSettings } from "./print-settings";
import { escapeHtml } from "./html";

export function buildSaleInvoiceHtml(sale: Sale, opts?: { paper?: "a4" | "thermal"; autoPrint?: boolean }): string {
  const shop = getShopProfile();
  const tax = getTaxConfig();
  const print = getPrintSettings();
  const paper = opts?.paper ?? print.defaultInvoicePaper;
  const width = paper === "thermal" ? `${print.thermalWidthMm}mm` : "210mm";
  const autoPrint = opts?.autoPrint !== false;
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
${autoPrint ? "<script>window.onload=function(){window.print&&window.print()}</script>" : ""}
</body></html>`;
}

type DesktopPrintBridge = {
  printHtml?: (input: { html: string; deviceName?: string | null; paper?: "a4" | "thermal"; thermalWidthMm?: number }) => Promise<{ ok: boolean; error?: string }>;
};

function directPrinterName(paper: "a4" | "thermal"): string {
  const print = getPrintSettings();
  return paper === "thermal" ? print.thermalPrinterName : print.a4PrinterName;
}

function tryDesktopDirectPrint(html: string, paper: "a4" | "thermal"): boolean {
  if (typeof window === "undefined") return false;
  const print = getPrintSettings();
  const bridge = (window as unknown as { minarvaDesktop?: DesktopPrintBridge }).minarvaDesktop;
  const deviceName = directPrinterName(paper);
  if (!print.silentDesktopPrint || !deviceName || !bridge?.printHtml) return false;
  void bridge.printHtml({ html, deviceName, paper, thermalWidthMm: print.thermalWidthMm }).then((result) => {
    if (!result.ok) console.error("[minarvabiz] direct print failed:", result.error || "Unknown printer error");
  }).catch((error) => console.error("[minarvabiz] direct print failed:", error));
  return true;
}

export function printSaleInvoice(sale: Sale, paper?: "a4" | "thermal") {
  if (typeof window === "undefined") return;
  const selectedPaper = paper ?? getPrintSettings().defaultInvoicePaper;
  const directHtml = buildSaleInvoiceHtml(sale, { paper: selectedPaper, autoPrint: false });
  if (tryDesktopDirectPrint(directHtml, selectedPaper)) return;
  const html = buildSaleInvoiceHtml(sale, { paper: selectedPaper, autoPrint: true });
  const w = window.open("", "_blank", selectedPaper === "thermal" ? "width=420,height=700" : "width=800,height=900");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

export function buildOrderInvoiceHtml(order: ServiceOrder, opts?: { paper?: "a4" | "thermal"; autoPrint?: boolean }): string {
  const shop = getShopProfile();
  const print = getPrintSettings();
  const paper = opts?.paper ?? print.defaultInvoicePaper;
  const width = paper === "thermal" ? `${print.thermalWidthMm}mm` : "210mm";
  const autoPrint = opts?.autoPrint !== false;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(order.orderNumber)}</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;padding:16px;color:#0f172a}
.sheet{max-width:${width};margin:0 auto}
h1{font-size:18px;margin:0 0 4px}.muted{color:#64748b;font-size:12px}
table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
td,th{border-bottom:1px solid #e2e8f0;padding:6px 4px;text-align:left}.r{text-align:right}.tot{font-weight:700}
@media print{body{padding:0}}
</style></head>
<body><div class="sheet">
<h1>${escapeHtml(shop.shopName || "Minarva Biz")}</h1>
<div class="muted">${escapeHtml(shop.address || "")}</div>
<div class="muted">${shop.phone ? "Tel: " + escapeHtml(shop.phone) : ""}</div>
<hr/>
<p><strong>Order:</strong> ${escapeHtml(order.orderNumber)}</p>
<p><strong>Customer:</strong> ${escapeHtml(order.customerName || "")}</p>
<p><strong>Service:</strong> ${escapeHtml(String(order.serviceType))} &nbsp; <strong>Status:</strong> ${escapeHtml(String(order.status))}</p>
<p><strong>Order date:</strong> ${new Date(order.orderDate).toLocaleString("en-IN")}</p>
${order.deliveryDate ? `<p><strong>Delivery:</strong> ${new Date(order.deliveryDate).toLocaleDateString("en-IN")}</p>` : ""}
<table>
<tr><td>Price</td><td class="r">${formatMoney(order.price)}</td></tr>
<tr><td>Discount</td><td class="r">${formatMoney(order.discount)}</td></tr>
<tr><td>Advance</td><td class="r">${formatMoney(order.advance)}</td></tr>
<tr class="tot"><td>Balance</td><td class="r">${formatMoney(order.balance)}</td></tr>
${paper === "a4" ? `<tr><td>Material cost</td><td class="r">${formatMoney(order.externalMaterialCost)}</td></tr><tr><td>Order expenses</td><td class="r">${formatMoney(order.orderExpensesTotal)}</td></tr>` : ""}
</table>
${order.notes ? `<p class="muted">Notes: ${escapeHtml(order.notes)}</p>` : ""}
<p class="muted">${escapeHtml(shop.receiptFooter || "Thank you!")}</p>
</div>${autoPrint ? "<script>window.onload=function(){window.print&&window.print()}</script>" : ""}</body></html>`;
}

export function printOrderInvoice(order: ServiceOrder, paper?: "a4" | "thermal") {
  if (typeof window === "undefined") return;
  const selectedPaper = paper ?? getPrintSettings().defaultInvoicePaper;
  const directHtml = buildOrderInvoiceHtml(order, { paper: selectedPaper, autoPrint: false });
  if (tryDesktopDirectPrint(directHtml, selectedPaper)) return;
  const html = buildOrderInvoiceHtml(order, { paper: selectedPaper, autoPrint: true });
  const w = window.open("", "_blank", selectedPaper === "thermal" ? "width=420,height=700" : "width=900,height=900");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

