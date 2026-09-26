/**
 * Professional template-driven invoice HTML for A4 / thermal / print preview.
 */

import type { Sale, ServiceOrder } from "@minarvabiz/types";
import { formatMoney } from "@minarvabiz/utils";
import { getShopProfile } from "./shop-profile";
import { getTaxConfig } from "./tax-config";
import { getPrintSettings, getPrintTemplate } from "./print-settings";
import { escapeHtml } from "./html";
import { tryDesktopPrintHtml } from "./desktop-print";
import type { PrintDocumentTemplate, PrintPaper } from "./print-templates";

function fullAddress(shop: ReturnType<typeof getShopProfile>): string {
  return [shop.address, shop.addressLine2, shop.district, shop.state, shop.postalCode, shop.country].filter(Boolean).join(", ");
}

function contactLine(shop: ReturnType<typeof getShopProfile>, template: PrintDocumentTemplate): string {
  return [
    template.showPhone && shop.phone ? `Tel: ${shop.phone}` : "",
    template.showEmail && shop.email ? shop.email : "",
    template.showWebsite && shop.website ? shop.website : "",
  ].filter(Boolean).join(" · ");
}

function invoiceStyles(template: PrintDocumentTemplate, paper: PrintPaper, width: string) {
  const compact = paper === "thermal" || template.layout === "compact";
  const base = compact ? 11 : 13;
  const pad = compact ? "3mm" : "12mm";
  const border = template.layout === "classic" ? "#94a3b8" : "#e2e8f0";
  return `
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#0f172a;background:#fff;font-size:${base * template.fontScale}px}
  .sheet{width:100%;max-width:${width};margin:0 auto;padding:${pad}}
  .brand{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:2px solid ${template.accentColor};padding-bottom:${compact ? 7 : 12}px}
  .business-name{font-size:${compact ? 15 : 22}px;font-weight:800;line-height:1.1}
  .legal{font-size:${compact ? 9 : 11}px;color:#475569;margin-top:2px}
  .doc{text-align:right;min-width:${compact ? 100 : 170}px}
  .doc-title{font-size:${compact ? 13 : 20}px;font-weight:800;color:${template.accentColor}}
  .muted{color:#64748b;font-size:${compact ? 9 : 11}px;line-height:1.45}
  .customer{margin:${compact ? 8 : 14}px 0;padding:${compact ? 6 : 10}px;background:#f8fafc;border:1px solid ${border};border-radius:6px}
  table{width:100%;border-collapse:collapse;margin-top:${compact ? 7 : 12}px}
  th{background:#f8fafc;color:#334155;font-weight:700;border-bottom:1px solid ${border};padding:${compact ? "4px 2px" : "7px 5px"};font-size:${compact ? 9 : 11}px}
  td{border-bottom:1px solid ${border};padding:${compact ? "4px 2px" : "7px 5px"};vertical-align:top}
  .r{text-align:right}.c{text-align:center}.nowrap{white-space:nowrap}
  .totals{margin-left:auto;width:${compact ? "100%" : "48%"}}
  .totals td:first-child{color:#475569}
  .grand td{font-weight:800;font-size:${compact ? 12 : 15}px;border-top:2px solid ${template.accentColor}}
  .notes,.terms{margin-top:${compact ? 8 : 14}px;font-size:${compact ? 9 : 11}px;color:#475569;white-space:pre-wrap}
  .signature{margin-top:32px;text-align:right;font-size:11px;color:#475569}
  .footer{margin-top:${compact ? 10 : 18}px;text-align:center;color:#64748b;font-size:${compact ? 9 : 10}px;border-top:1px solid ${border};padding-top:8px}
  @media print{body{padding:0}.sheet{box-shadow:none}}
  `;
}

function renderBusinessHeader(
  template: PrintDocumentTemplate,
  title: string,
  number: string,
  dateText: string,
): string {
  const shop = getShopProfile();
  const tax = getTaxConfig();
  const address = fullAddress(shop);
  const contacts = contactLine(shop, template);
  const gstin = shop.gstin || tax.gstin;
  return `
  <div class="brand">
    <div>
      <div class="business-name">${escapeHtml(shop.shopName || "Minarva Biz")}</div>
      ${template.showLegalName && shop.legalName ? `<div class="legal">${escapeHtml(shop.legalName)}</div>` : ""}
      ${template.subheading ? `<div class="muted">${escapeHtml(template.subheading)}</div>` : ""}
      ${template.showAddress && address ? `<div class="muted">${escapeHtml(address)}</div>` : ""}
      ${contacts ? `<div class="muted">${escapeHtml(contacts)}</div>` : ""}
      ${template.showGstin && gstin ? `<div class="muted"><strong>GSTIN:</strong> ${escapeHtml(gstin)}</div>` : ""}
    </div>
    <div class="doc">
      <div class="doc-title">${escapeHtml(template.heading || title)}</div>
      <div><strong>${escapeHtml(number)}</strong></div>
      <div class="muted">${escapeHtml(dateText)}</div>
    </div>
  </div>`;
}

export function buildSaleInvoiceHtml(sale: Sale, opts?: { paper?: PrintPaper; autoPrint?: boolean }): string {
  const print = getPrintSettings();
  const paper = opts?.paper ?? print.defaultInvoicePaper;
  const template = getPrintTemplate("invoice", paper);
  const width = paper === "thermal" ? `${print.thermalWidthMm}mm` : "210mm";
  const autoPrint = opts?.autoPrint === true;

  const itemHeaders = [
    "<th>Item</th>",
    template.showSku ? "<th>SKU</th>" : "",
    "<th class=\"r\">Qty</th>",
    "<th class=\"r\">Rate</th>",
    template.showTax ? "<th class=\"r\">Tax</th>" : "",
    "<th class=\"r\">Amount</th>",
  ].join("");

  const rows = sale.items.map((item) => `
    <tr>
      <td>${escapeHtml(item.productName)}</td>
      ${template.showSku ? `<td class="muted">${escapeHtml(item.sku || "—")}</td>` : ""}
      <td class="r">${item.quantity}</td>
      <td class="r nowrap">${formatMoney(item.unitPrice)}</td>
      ${template.showTax ? `<td class="r">${Number(item.taxRate || 0).toFixed(2)}%</td>` : ""}
      <td class="r nowrap">${formatMoney(item.lineTotal)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(sale.invoiceNumber)}</title>
<style>${invoiceStyles(template, paper, width)}</style></head><body><div class="sheet">
${renderBusinessHeader(template, "INVOICE", sale.invoiceNumber, new Date(sale.saleDate).toLocaleString("en-IN"))}
${template.showCustomer ? `<div class="customer"><div class="muted">Bill to</div><strong>${escapeHtml(sale.customerName || "Walk-in Customer")}</strong></div>` : ""}
<table><thead><tr>${itemHeaders}</tr></thead><tbody>${rows}</tbody></table>
<table class="totals">
<tr><td>Subtotal</td><td class="r">${formatMoney(sale.subtotal)}</td></tr>
${sale.discountAmount ? `<tr><td>Discount</td><td class="r">-${formatMoney(sale.discountAmount)}</td></tr>` : ""}
${template.showTax && sale.taxAmount ? `<tr><td>GST / Tax</td><td class="r">${formatMoney(sale.taxAmount)}</td></tr>` : ""}
<tr class="grand"><td>Total</td><td class="r">${formatMoney(sale.total)}</td></tr>
${template.showPaymentSummary ? `<tr><td>Paid</td><td class="r">${formatMoney(sale.paidAmount)}</td></tr>
<tr><td>Balance</td><td class="r">${formatMoney(sale.balanceAmount)}</td></tr>` : ""}
</table>
${template.showNotes && sale.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(sale.notes)}</div>` : ""}
${template.showTerms && template.termsText ? `<div class="terms"><strong>Terms:</strong> ${escapeHtml(template.termsText)}</div>` : ""}
${template.showSignature && paper === "a4" ? `<div class="signature">For ${escapeHtml(getShopProfile().shopName || "Business")}<br/><br/><strong>Authorised Signatory</strong></div>` : ""}
<div class="footer">${escapeHtml(template.footerText || getShopProfile().receiptFooter || "Thank you for your business.")}</div>
</div>${autoPrint ? "<script>window.onload=function(){window.print&&window.print()}</script>" : ""}</body></html>`;
}

export function printSaleInvoice(sale: Sale, paper?: PrintPaper) {
  if (typeof window === "undefined") return;
  const selectedPaper = paper ?? getPrintSettings().defaultInvoicePaper;
  const directHtml = buildSaleInvoiceHtml(sale, { paper: selectedPaper, autoPrint: false });
  if (tryDesktopPrintHtml(directHtml, selectedPaper)) return;
  const html = buildSaleInvoiceHtml(sale, { paper: selectedPaper, autoPrint: true });
  const w = window.open("", "_blank", selectedPaper === "thermal" ? "width=420,height=700" : "width=900,height=900");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

export function buildOrderInvoiceHtml(order: ServiceOrder, opts?: { paper?: PrintPaper; autoPrint?: boolean }): string {
  const print = getPrintSettings();
  const paper = opts?.paper ?? print.defaultInvoicePaper;
  const template = getPrintTemplate("invoice", paper);
  const width = paper === "thermal" ? `${print.thermalWidthMm}mm` : "210mm";
  const autoPrint = opts?.autoPrint === true;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(order.orderNumber)}</title>
<style>${invoiceStyles(template, paper, width)}</style></head><body><div class="sheet">
${renderBusinessHeader(template, "SERVICE INVOICE", order.orderNumber, new Date(order.orderDate).toLocaleString("en-IN"))}
${template.showCustomer ? `<div class="customer"><div class="muted">Customer</div><strong>${escapeHtml(order.customerName || "")}</strong><div class="muted">${escapeHtml(String(order.serviceType).replace(/_/g, " "))} · ${escapeHtml(String(order.status))}</div></div>` : ""}
<table>
<tr><td>Service price</td><td class="r">${formatMoney(order.price)}</td></tr>
<tr><td>Discount</td><td class="r">${formatMoney(order.discount)}</td></tr>
<tr><td>Advance</td><td class="r">${formatMoney(order.advance)}</td></tr>
<tr class="grand"><td>Balance</td><td class="r">${formatMoney(order.balance)}</td></tr>
${paper === "a4" ? `<tr><td>Material cost</td><td class="r">${formatMoney(order.externalMaterialCost)}</td></tr><tr><td>Order expenses</td><td class="r">${formatMoney(order.orderExpensesTotal)}</td></tr>` : ""}
</table>
${order.deliveryDate ? `<div class="notes"><strong>Delivery:</strong> ${new Date(order.deliveryDate).toLocaleDateString("en-IN")}</div>` : ""}
${template.showNotes && order.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(order.notes)}</div>` : ""}
${template.showTerms && template.termsText ? `<div class="terms"><strong>Terms:</strong> ${escapeHtml(template.termsText)}</div>` : ""}
${template.showSignature && paper === "a4" ? `<div class="signature">For ${escapeHtml(getShopProfile().shopName || "Business")}<br/><br/><strong>Authorised Signatory</strong></div>` : ""}
<div class="footer">${escapeHtml(template.footerText || getShopProfile().receiptFooter || "Thank you.")}</div>
</div>${autoPrint ? "<script>window.onload=function(){window.print&&window.print()}</script>" : ""}</body></html>`;
}

export function printOrderInvoice(order: ServiceOrder, paper?: PrintPaper) {
  if (typeof window === "undefined") return;
  const selectedPaper = paper ?? getPrintSettings().defaultInvoicePaper;
  const directHtml = buildOrderInvoiceHtml(order, { paper: selectedPaper, autoPrint: false });
  if (tryDesktopPrintHtml(directHtml, selectedPaper)) return;
  const html = buildOrderInvoiceHtml(order, { paper: selectedPaper, autoPrint: true });
  const w = window.open("", "_blank", selectedPaper === "thermal" ? "width=420,height=700" : "width=900,height=900");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
