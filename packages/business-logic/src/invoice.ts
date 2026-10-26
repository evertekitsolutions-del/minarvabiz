/**
 * Professional invoice HTML for thermal / A4 / print-preview.
 */

import type { Sale, ServiceOrder } from "@minarvabiz/types";
import { formatMoney, toQuantityMilli, QUANTITY_MILLI_FACTOR } from "@minarvabiz/utils";
import { parseDimensionLineMetadata } from "./dimensional-billing";
import { getPrintSettings, getPrintTemplateFor } from "./print-settings";
import { escapeHtml } from "./html";
import { requestDesktopPrintHtml, tryDesktopPrintHtml } from "./desktop-print";
import { businessHeaderHtml, customerBlockHtml, documentCss, documentFooterHtml } from "./print-document-render";
import * as mainStore from "./store";
import type { PrintDocumentTemplate } from "./print-templates";

function templateFor(paper: "a4" | "thermal", templateId?: string): PrintDocumentTemplate {
  return getPrintTemplateFor("invoice", paper, templateId);
}

/** Customer-visible, immutable measurement evidence on both invoice formats. */
function dimensionalInvoiceMeta(item: Sale["items"][number]): string {
  if (item.dimensionMetadata == null) return "";
  const milli = toQuantityMilli(item.quantity);
  if (!Number.isFinite(item.quantity) ||
      Math.abs(milli / QUANTITY_MILLI_FACTOR - item.quantity) > 1e-9) {
    throw new Error("Cannot print an invoice with invalid dimension quantity precision");
  }
  const m = parseDimensionLineMetadata(item.dimensionMetadata, milli);
  return `<div class="meta">Area: ${escapeHtml(m.length)} ${escapeHtml(m.lengthUnit)} ×
    ${escapeHtml(m.width)} ${escapeHtml(m.widthUnit)} ×
    ${m.pieces} pcs = ${m.quantityMilli / QUANTITY_MILLI_FACTOR} ${escapeHtml(m.billableUnit)}</div>`;
}

export function buildSaleInvoiceHtml(
  sale: Sale,
  opts?: { paper?: "a4" | "thermal"; autoPrint?: boolean; templateId?: string },
): string {
  const print = getPrintSettings();
  const paper = opts?.paper ?? print.defaultInvoicePaper;
  const template = templateFor(paper, opts?.templateId);
  const width = paper === "thermal" ? `${print.thermalWidthMm}mm` : "210mm";
  const autoPrint = opts?.autoPrint !== false;
  const customer = sale.customerId ? mainStore.getCustomer(sale.customerId) : null;

  const rows = sale.items.map((item, index) => {
    const discount = Number(item.discountPercent || 0);
    const tax = Number(item.taxRate || 0);
    return `<tr>
      <td class="c">${index + 1}</td>
      <td>${escapeHtml(item.productName)}${template.showSku && item.sku ? `<div class="meta">SKU: ${escapeHtml(item.sku)}</div>` : ""}${dimensionalInvoiceMeta(item)}</td>
      <td class="r">${item.quantity}</td>
      <td class="r nowrap">${formatMoney(item.unitPrice)}</td>
      ${template.showTax ? `<td class="r">${discount ? `${discount}%` : "—"}</td><td class="r">${tax ? `${tax}%` : "—"}</td>` : ""}
      <td class="r nowrap">${formatMoney(item.lineTotal)}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(sale.invoiceNumber)}</title>
<style>${documentCss(template, width)}</style></head><body><div class="sheet">
${businessHeaderHtml(template, { number: sale.invoiceNumber, date: sale.saleDate, fallbackTitle: "TAX INVOICE" })}
${customerBlockHtml(template, customer, sale.customerName || "Walk-in")}
<table>
  <thead><tr><th class="c">#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th>${template.showTax ? '<th class="r">Disc.</th><th class="r">Tax</th>' : ''}<th class="r">Amount</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<table class="totals">
  <tr><td>Subtotal</td><td class="r">${formatMoney(sale.subtotal)}</td></tr>
  ${sale.discountAmount ? `<tr><td>Discount</td><td class="r">− ${formatMoney(sale.discountAmount)}</td></tr>` : ""}
  ${template.showTax && sale.taxAmount ? `<tr><td>Tax</td><td class="r">${formatMoney(sale.taxAmount)}</td></tr>` : ""}
  <tr class="grand"><td>Grand Total</td><td class="r">${formatMoney(sale.total)}</td></tr>
  ${template.showPaymentSummary ? `<tr><td>Paid</td><td class="r">${formatMoney(sale.paidAmount)}</td></tr><tr><td>Balance</td><td class="r">${formatMoney(sale.balanceAmount)}</td></tr>` : ""}
</table>
${documentFooterHtml(template, sale.notes)}
</div>${autoPrint ? "<script>window.onload=function(){window.print&&window.print()}</script>" : ""}</body></html>`;
}

export type SaleInvoicePrintAttempt =
  | { ok: true; state: "native-accepted" | "browser-window-opened" }
  | { ok: false; state: "blocked"; error: string };

/**
 * Start print synchronously from the user's click (browser popup rules), but
 * return the native bridge result asynchronously. Do not equate dispatch with
 * physically printed paper or retry the sale/payment transaction on failure.
 */
export function requestSaleInvoicePrint(
  sale: Sale,
  paper?: "a4" | "thermal",
  templateId?: string,
): Promise<SaleInvoicePrintAttempt> {
  if (typeof window === "undefined") {
    return Promise.resolve({ ok: false, state: "blocked", error: "Printing requires an open app window" });
  }
  try {
    const selectedPaper = paper ?? getPrintSettings().defaultInvoicePaper;
    const directHtml = buildSaleInvoiceHtml(sale, { paper: selectedPaper, autoPrint: false, templateId });
    const native = requestDesktopPrintHtml(directHtml, selectedPaper);
    if (native) {
      return native.then((result): SaleInvoicePrintAttempt =>
        result.ok
          ? { ok: true, state: "native-accepted" }
          : { ok: false, state: "blocked", error: result.error || "Printer rejected the request" },
      );
    }

    // Opening the browser window must happen before any await or promise
    // callback or popup blockers will treat it as an unsolicited popup.
    const html = buildSaleInvoiceHtml(sale, { paper: selectedPaper, autoPrint: true, templateId });
    const popup = window.open(
      "",
      "_blank",
      selectedPaper === "thermal" ? "width=420,height=700" : "width=900,height=900",
    );
    if (!popup) {
      return Promise.resolve({
        ok: false, state: "blocked",
        error: "Print window was blocked. Allow popups for this app, then retry the saved invoice.",
      });
    }
    try {
      popup.document.write(html);
      popup.document.close();
    } catch (error) {
      try { popup.close(); } catch { /* popup may already be unavailable */ }
      throw error;
    }
    return Promise.resolve({ ok: true, state: "browser-window-opened" });
  } catch (error) {
    return Promise.resolve({
      ok: false,
      state: "blocked",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function printSaleInvoice(sale: Sale, paper?: "a4" | "thermal", templateId?: string) {
  if (typeof window === "undefined") return;
  const selectedPaper = paper ?? getPrintSettings().defaultInvoicePaper;
  const directHtml = buildSaleInvoiceHtml(sale, { paper: selectedPaper, autoPrint: false, templateId });
  if (tryDesktopPrintHtml(directHtml, selectedPaper)) return;
  const html = buildSaleInvoiceHtml(sale, { paper: selectedPaper, autoPrint: true, templateId });
  const w = window.open("", "_blank", selectedPaper === "thermal" ? "width=420,height=700" : "width=900,height=900");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

export function buildOrderInvoiceHtml(
  order: ServiceOrder,
  opts?: { paper?: "a4" | "thermal"; autoPrint?: boolean; templateId?: string },
): string {
  const print = getPrintSettings();
  const paper = opts?.paper ?? print.defaultInvoicePaper;
  const template = templateFor(paper, opts?.templateId);
  const width = paper === "thermal" ? `${print.thermalWidthMm}mm` : "210mm";
  const autoPrint = opts?.autoPrint !== false;
  const customer = mainStore.getCustomer(order.customerId);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(order.orderNumber)}</title>
<style>${documentCss(template, width)}</style></head><body><div class="sheet">
${businessHeaderHtml(template, { number: order.orderNumber, date: order.orderDate, fallbackTitle: "SERVICE INVOICE", extraMeta: order.deliveryDate ? `Delivery: ${new Date(order.deliveryDate).toLocaleDateString("en-IN")}` : undefined })}
${customerBlockHtml(template, customer, order.customerName || "")}
<table>
  <thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
  <tbody>
    <tr><td>Service — ${escapeHtml(String(order.serviceType).replace(/_/g, " "))}</td><td class="r">${formatMoney(order.price)}</td></tr>
    ${order.discount ? `<tr><td>Discount</td><td class="r">− ${formatMoney(order.discount)}</td></tr>` : ""}
  </tbody>
</table>
<table class="totals">
  <tr><td>Service Total</td><td class="r">${formatMoney(Math.max(0, order.price - order.discount))}</td></tr>
  ${template.showPaymentSummary ? `<tr><td>Advance Paid</td><td class="r">${formatMoney(order.advance)}</td></tr><tr class="grand"><td>Balance</td><td class="r">${formatMoney(order.balance)}</td></tr>` : `<tr class="grand"><td>Total</td><td class="r">${formatMoney(Math.max(0, order.price - order.discount))}</td></tr>`}
</table>
${documentFooterHtml(template, order.notes)}
</div>${autoPrint ? "<script>window.onload=function(){window.print&&window.print()}</script>" : ""}</body></html>`;
}

export function requestOrderInvoicePrint(
  order: ServiceOrder,
  paper?: "a4" | "thermal",
  templateId?: string,
): Promise<SaleInvoicePrintAttempt> {
  if (typeof window === "undefined") {
    return Promise.resolve({ ok: false, state: "blocked", error: "Printing requires an open app window" });
  }
  try {
    const selectedPaper = paper ?? getPrintSettings().defaultInvoicePaper;
    const directHtml = buildOrderInvoiceHtml(order, { paper: selectedPaper, autoPrint: false, templateId });
    const native = requestDesktopPrintHtml(directHtml, selectedPaper);
    if (native) {
      return native.then((result): SaleInvoicePrintAttempt =>
        result.ok
          ? { ok: true, state: "native-accepted" }
          : { ok: false, state: "blocked", error: result.error || "Printer rejected the request" },
      );
    }
    const html = buildOrderInvoiceHtml(order, { paper: selectedPaper, autoPrint: true, templateId });
    const popup = window.open(
      "",
      "_blank",
      selectedPaper === "thermal" ? "width=420,height=700" : "width=900,height=900",
    );
    if (!popup) {
      return Promise.resolve({
        ok: false, state: "blocked",
        error: "Print window was blocked. Allow popups for this app, then retry the saved service invoice.",
      });
    }
    try {
      popup.document.write(html);
      popup.document.close();
    } catch (error) {
      try { popup.close(); } catch { /* popup may already be unavailable */ }
      throw error;
    }
    return Promise.resolve({ ok: true, state: "browser-window-opened" });
  } catch (error) {
    return Promise.resolve({
      ok: false, state: "blocked",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function printOrderInvoice(order: ServiceOrder, paper?: "a4" | "thermal", templateId?: string) {
  if (typeof window === "undefined") return;
  const selectedPaper = paper ?? getPrintSettings().defaultInvoicePaper;
  const directHtml = buildOrderInvoiceHtml(order, { paper: selectedPaper, autoPrint: false, templateId });
  if (tryDesktopPrintHtml(directHtml, selectedPaper)) return;
  const html = buildOrderInvoiceHtml(order, { paper: selectedPaper, autoPrint: true, templateId });
  const w = window.open("", "_blank", selectedPaper === "thermal" ? "width=420,height=700" : "width=900,height=900");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
