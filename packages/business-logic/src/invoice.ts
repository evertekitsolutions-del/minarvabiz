/**
 * Professional invoice HTML for A4 / thermal / preview.
 */

import type { Sale, ServiceOrder } from "@minarvabiz/types";
import { formatMoney } from "@minarvabiz/utils";
import { getShopProfile } from "./shop-profile";
import { getTaxConfig } from "./tax-config";
import { getPrintSettings } from "./print-settings";
import { getPrintTemplate, type PrintPaper, type PrintTemplate } from "./print-templates";
import { escapeHtml } from "./html";
import { tryDesktopPrintHtml } from "./desktop-print";
import * as mainStore from "./store";

function templateIdForInvoice(paper: PrintPaper): string {
  const settings = getPrintSettings();
  return paper === "a4" ? settings.invoiceA4TemplateId : settings.invoiceThermalTemplateId;
}

function fontStack(template: PrintTemplate): string {
  if (template.fontFamily === "serif") return "Georgia, 'Times New Roman', serif";
  if (template.fontFamily === "mono") return "'Courier New', monospace";
  return "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
}

function businessAddressHtml(template: PrintTemplate): string {
  if (!template.showAddress) return "";
  const shop = getShopProfile();
  const lines = [
    shop.address,
    shop.addressLine2,
    [shop.district, shop.state, shop.postalCode].filter(Boolean).join(", "),
    shop.country,
  ].filter(Boolean);
  return lines.map((line) => `<div>${escapeHtml(line)}</div>`).join("");
}

function businessContactsHtml(template: PrintTemplate): string {
  const shop = getShopProfile();
  const tax = getTaxConfig();
  const entries: string[] = [];
  if (template.showPhone && shop.phone) entries.push(`Tel: ${escapeHtml(shop.phone)}`);
  if (template.showEmail && shop.email) entries.push(escapeHtml(shop.email));
  if (template.showWebsite && shop.website) entries.push(escapeHtml(shop.website));
  if (template.showGstin && (shop.gstin || tax.gstin)) entries.push(`GSTIN: ${escapeHtml(shop.gstin || tax.gstin)}`);
  return entries.map((entry) => `<div>${entry}</div>`).join("");
}

function templateCss(template: PrintTemplate, paper: PrintPaper, width: string): string {
  const compact = template.density === "compact" || paper === "thermal";
  const bodySize = paper === "thermal" ? 10 : compact ? 11 : 12;
  const cellPad = paper === "thermal" ? "3px 2px" : compact ? "5px 4px" : "7px 5px";
  return `
    *{box-sizing:border-box}
    body{font-family:${fontStack(template)};margin:0;padding:${paper === "thermal" ? "4mm 2mm" : "12mm"};color:#0f172a;font-size:${bodySize}px;background:white}
    .sheet{width:100%;max-width:${width};margin:0 auto}
    .accent{color:${template.accentColor}}
    .brand{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:2px solid ${template.accentColor};padding-bottom:10px}
    .brand h1{font-size:${paper === "thermal" ? 15 : 22}px;margin:0 0 3px}
    .legal{font-size:${paper === "thermal" ? 9 : 11}px;color:#475569}
    .meta{font-size:${paper === "thermal" ? 8.5 : 10.5}px;color:#475569;line-height:1.45}
    .doc{text-align:right;min-width:${paper === "thermal" ? "110px" : "180px"}}
    .doc-title{font-size:${paper === "thermal" ? 13 : 20}px;font-weight:800;color:${template.accentColor};letter-spacing:.04em}
    .section{margin-top:${paper === "thermal" ? "8px" : "14px"}}
    .billto{display:grid;grid-template-columns:${paper === "thermal" ? "1fr" : "1fr 1fr"};gap:10px}
    .label{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-weight:700}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th{background:#f8fafc;color:#334155;font-size:${paper === "thermal" ? 8.5 : 10}px;text-transform:uppercase;letter-spacing:.03em}
    th,td{border-bottom:1px solid #e2e8f0;padding:${cellPad};text-align:left;vertical-align:top}
    .r{text-align:right;white-space:nowrap}
    .summary{margin-left:auto;width:${paper === "thermal" ? "100%" : "48%"}}
    .summary td:first-child{color:#475569}
    .grand td{font-size:${paper === "thermal" ? 12 : 15}px;font-weight:800;border-top:2px solid ${template.accentColor}}
    .note,.terms{white-space:pre-wrap;color:#475569;font-size:${paper === "thermal" ? 8.5 : 10.5}px}
    .footer{margin-top:16px;border-top:1px solid #e2e8f0;padding-top:10px;text-align:center;color:#64748b;font-size:${paper === "thermal" ? 8 : 10}px}
    .sign{margin-top:30px;text-align:right}.sign-line{display:inline-block;min-width:150px;border-top:1px solid #64748b;padding-top:5px;text-align:center}
    @media print{body{padding:0}.sheet{max-width:none}}
  `;
}

export function buildSaleInvoiceHtml(
  sale: Sale,
  opts?: { paper?: PrintPaper; autoPrint?: boolean; templateId?: string | null; template?: PrintTemplate },
): string {
  const shop = getShopProfile();
  const tax = getTaxConfig();
  const settings = getPrintSettings();
  const paper = opts?.paper ?? settings.defaultInvoicePaper;
  const template = opts?.template || getPrintTemplate("invoice", paper, opts?.templateId || templateIdForInvoice(paper));
  const width = paper === "thermal" ? `${settings.thermalWidthMm}mm` : "210mm";
  const autoPrint = opts?.autoPrint === true;
  const customer = sale.customerId ? mainStore.getCustomer(sale.customerId) : undefined;

  const headers = [
    `<th>${escapeHtml(template.labels.item)}</th>`,
    template.showSku ? `<th>${escapeHtml(template.labels.sku)}</th>` : "",
    `<th class="r">${escapeHtml(template.labels.qty)}</th>`,
    `<th class="r">${escapeHtml(template.labels.rate)}</th>`,
    template.showDiscount ? `<th class="r">${escapeHtml(template.labels.discount)}</th>` : "",
    template.showTax ? `<th class="r">${escapeHtml(template.labels.tax)}</th>` : "",
    `<th class="r">${escapeHtml(template.labels.amount)}</th>`,
  ].join("");

  const rows = sale.items.map((item) => [
    "<tr>",
    `<td><strong>${escapeHtml(item.productName)}</strong></td>`,
    template.showSku ? `<td>${escapeHtml(item.sku || "—")}</td>` : "",
    `<td class="r">${item.quantity}</td>`,
    `<td class="r">${formatMoney(item.unitPrice)}</td>`,
    template.showDiscount ? `<td class="r">${Number(item.discountPercent || 0).toFixed(2)}%</td>` : "",
    template.showTax ? `<td class="r">${Number(item.taxRate || 0).toFixed(2)}%</td>` : "",
    `<td class="r">${formatMoney(item.lineTotal)}</td>`,
    "</tr>",
  ].join("")).join("");

  const customerAddress = template.showCustomerAddress && customer?.address
    ? `<div class="meta">${escapeHtml(customer.address)}</div>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(sale.invoiceNumber)}</title>
<style>${templateCss(template, paper, width)}</style></head><body><div class="sheet">
  <div class="brand">
    <div>
      <h1>${escapeHtml(shop.shopName || "Minarva Biz")}</h1>
      ${template.showLegalName && shop.legalName && shop.legalName !== shop.shopName ? `<div class="legal">${escapeHtml(shop.legalName)}</div>` : ""}
      <div class="meta">${businessAddressHtml(template)}${businessContactsHtml(template)}</div>
    </div>
    <div class="doc">
      <div class="doc-title">${escapeHtml(template.title || "INVOICE")}</div>
      <div><strong>${escapeHtml(template.labels.documentNumber)}</strong> ${escapeHtml(sale.invoiceNumber)}</div>
      <div class="meta"><strong>${escapeHtml(template.labels.date)}</strong> ${new Date(sale.saleDate).toLocaleString("en-IN")}</div>
    </div>
  </div>
  ${template.headerText ? `<div class="section note">${escapeHtml(template.headerText)}</div>` : ""}
  <div class="section billto">
    <div><div class="label">${escapeHtml(template.labels.customer)}</div><div><strong>${escapeHtml(sale.customerName || "Walk-in Customer")}</strong></div>${customerAddress}</div>
    <div class="meta">${customer?.phone ? `<div>${escapeHtml(customer.phone)}</div>` : ""}${customer?.email ? `<div>${escapeHtml(customer.email)}</div>` : ""}</div>
  </div>
  <table class="section"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
  <table class="summary">
    <tr><td>${escapeHtml(template.labels.subtotal)}</td><td class="r">${formatMoney(sale.subtotal)}</td></tr>
    ${template.showDiscount && sale.discountAmount ? `<tr><td>${escapeHtml(template.labels.discount)}</td><td class="r">-${formatMoney(sale.discountAmount)}</td></tr>` : ""}
    ${template.showTax && (sale.taxAmount || tax.enableGst) ? `<tr><td>${escapeHtml(template.labels.tax)}</td><td class="r">${formatMoney(sale.taxAmount)}</td></tr>` : ""}
    <tr class="grand"><td>${escapeHtml(template.labels.total)}</td><td class="r">${formatMoney(sale.total)}</td></tr>
    ${template.showPaymentSummary ? `<tr><td>${escapeHtml(template.labels.paid)}</td><td class="r">${formatMoney(sale.paidAmount)}</td></tr><tr><td>${escapeHtml(template.labels.balance)}</td><td class="r">${formatMoney(sale.balanceAmount)}</td></tr>` : ""}
  </table>
  ${template.showNotes && sale.notes ? `<div class="section note"><strong>${escapeHtml(template.labels.notes)}:</strong> ${escapeHtml(sale.notes)}</div>` : ""}
  ${template.showTerms && template.termsText ? `<div class="section terms"><strong>Terms:</strong> ${escapeHtml(template.termsText)}</div>` : ""}
  ${template.showAuthorizedSignatory ? `<div class="sign"><span class="sign-line">Authorized Signatory</span></div>` : ""}
  <div class="footer">${escapeHtml(template.footerText || shop.receiptFooter || "Thank you for your business.")}</div>
</div>${autoPrint ? "<script>window.onload=function(){window.print&&window.print()}</script>" : ""}</body></html>`;
}

export function printSaleInvoice(sale: Sale, paper?: PrintPaper) {
  if (typeof window === "undefined") return;
  const selectedPaper = paper ?? getPrintSettings().defaultInvoicePaper;
  const html = buildSaleInvoiceHtml(sale, { paper: selectedPaper, autoPrint: false });
  if (tryDesktopPrintHtml(html, selectedPaper)) return;
  const w = window.open("", "_blank", selectedPaper === "thermal" ? "width=420,height=700" : "width=900,height=900");
  if (!w) return;
  w.document.write(buildSaleInvoiceHtml(sale, { paper: selectedPaper, autoPrint: true }));
  w.document.close();
}

export function buildOrderInvoiceHtml(order: ServiceOrder, opts?: { paper?: PrintPaper; autoPrint?: boolean }): string {
  const shop = getShopProfile();
  const print = getPrintSettings();
  const paper = opts?.paper ?? print.defaultInvoicePaper;
  const width = paper === "thermal" ? `${print.thermalWidthMm}mm` : "210mm";
  const autoPrint = opts?.autoPrint === true;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(order.orderNumber)}</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;padding:16px;color:#0f172a}.sheet{max-width:${width};margin:0 auto}
h1{font-size:18px;margin:0 0 4px}.muted{color:#64748b;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
td,th{border-bottom:1px solid #e2e8f0;padding:6px 4px;text-align:left}.r{text-align:right}.tot{font-weight:700}@media print{body{padding:0}}
</style></head><body><div class="sheet"><h1>${escapeHtml(shop.shopName || "Minarva Biz")}</h1>
<div class="muted">${businessAddressHtml(getPrintTemplate("invoice", paper, templateIdForInvoice(paper)))}</div><hr/>
<p><strong>Order:</strong> ${escapeHtml(order.orderNumber)}</p><p><strong>Customer:</strong> ${escapeHtml(order.customerName || "")}</p>
<p><strong>Service:</strong> ${escapeHtml(String(order.serviceType))} &nbsp; <strong>Status:</strong> ${escapeHtml(String(order.status))}</p>
<p><strong>Order date:</strong> ${new Date(order.orderDate).toLocaleString("en-IN")}</p>
${order.deliveryDate ? `<p><strong>Delivery:</strong> ${new Date(order.deliveryDate).toLocaleDateString("en-IN")}</p>` : ""}
<table><tr><td>Price</td><td class="r">${formatMoney(order.price)}</td></tr><tr><td>Discount</td><td class="r">${formatMoney(order.discount)}</td></tr>
<tr><td>Advance</td><td class="r">${formatMoney(order.advance)}</td></tr><tr class="tot"><td>Balance</td><td class="r">${formatMoney(order.balance)}</td></tr>
${paper === "a4" ? `<tr><td>Material cost</td><td class="r">${formatMoney(order.externalMaterialCost)}</td></tr><tr><td>Order expenses</td><td class="r">${formatMoney(order.orderExpensesTotal)}</td></tr>` : ""}</table>
${order.notes ? `<p class="muted">Notes: ${escapeHtml(order.notes)}</p>` : ""}<p class="muted">${escapeHtml(shop.receiptFooter || "Thank you!")}</p>
</div>${autoPrint ? "<script>window.onload=function(){window.print&&window.print()}</script>" : ""}</body></html>`;
}

export function printOrderInvoice(order: ServiceOrder, paper?: PrintPaper) {
  if (typeof window === "undefined") return;
  const selectedPaper = paper ?? getPrintSettings().defaultInvoicePaper;
  const html = buildOrderInvoiceHtml(order, { paper: selectedPaper, autoPrint: false });
  if (tryDesktopPrintHtml(html, selectedPaper)) return;
  const w = window.open("", "_blank", selectedPaper === "thermal" ? "width=420,height=700" : "width=900,height=900");
  if (!w) return;
  w.document.write(buildOrderInvoiceHtml(order, { paper: selectedPaper, autoPrint: true }));
  w.document.close();
}
