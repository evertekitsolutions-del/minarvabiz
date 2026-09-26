/**
 * Quotation / estimate system
 */
import type { Quotation, QuotationLine, QuotationStatus, UUID } from "@minarvabiz/types";
import { formatMoney, generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { enqueueOutbox } from "./outbox-bridge";
import * as mainStore from "./store";
import * as ordersStore from "./orders-store";
import { escapeHtml } from "./html";
import { getShopProfile } from "./shop-profile";
import { nextBusinessDocumentNumber } from "./document-numbering";
import { getPrintSettings } from "./print-settings";
import { getPrintTemplate, type PrintPaper, type PrintTemplate } from "./print-templates";
import { tryDesktopPrintHtml } from "./desktop-print";

const quotations: Quotation[] = [];
function nextQuotationNumber(): string {
  const shop = getShopProfile();
  return nextBusinessDocumentNumber({
    kind: "QT",
    existingNumbers: quotations.map((quotation) => quotation.quotationNumber),
    businessCode: shop.documentCode,
    businessName: shop.legalName || shop.shopName,
    date: new Date(),
  });
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function listQuotations(opts?: { status?: QuotationStatus; customerId?: UUID; query?: string }): Quotation[] {
  let list = quotations.filter((q) => !q.deletedAt);
  if (opts?.status) list = list.filter((q) => q.status === opts.status);
  if (opts?.customerId) list = list.filter((q) => q.customerId === opts.customerId);
  if (opts?.query?.trim()) {
    const q = opts.query.toLowerCase();
    list = list.filter(
      (x) =>
        x.quotationNumber.toLowerCase().includes(q) ||
        (x.customerName || "").toLowerCase().includes(q)
    );
  }
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getQuotation(id: UUID): Quotation | undefined {
  return quotations.find((q) => q.id === id && !q.deletedAt);
}

export function createQuotation(input: {
  customerId: UUID;
  lines: Array<{ kind: QuotationLine["kind"]; productId?: UUID | null; description: string; quantity: number; unitPrice: number }>;
  materialCharges?: number;
  labourCharges?: number;
  discount?: number;
  tax?: number;
  advance?: number;
  validUntil?: string | null;
  notes?: string | null;
}): { quotation: Quotation | null; errors: string[] } {
  assertPermission("sales.create");
  const customer = mainStore.getCustomer(input.customerId);
  if (!customer) return { quotation: null, errors: ["Customer not found"] };
  if (!input.lines.length) return { quotation: null, errors: ["Add at least one line"] };

  const lines: QuotationLine[] = input.lines.map((l) => ({
    id: generateId(),
    kind: l.kind,
    productId: l.productId ?? null,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    lineTotal: round2(l.quantity * l.unitPrice),
  }));
  const linesSum = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const materialCharges = round2(input.materialCharges ?? 0);
  const labourCharges = round2(input.labourCharges ?? 0);
  const subtotal = round2(linesSum + materialCharges + labourCharges);
  const discount = round2(input.discount ?? 0);
  const tax = round2(input.tax ?? 0);
  const total = round2(subtotal - discount + tax);
  const advance = round2(input.advance ?? 0);
  const balance = round2(total - advance);

  const quotation: Quotation = {
    id: generateId(),
    quotationNumber: nextQuotationNumber(),
    customerId: input.customerId,
    customerName: customer.name,
    status: "draft",
    lines,
    materialCharges,
    labourCharges,
    subtotal,
    discount,
    tax,
    total,
    advance,
    balance,
    validUntil: input.validUntil ?? null,
    notes: input.notes ?? null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    version: 1,
  };
  quotations.push(quotation);
  enqueueOutbox("quotations", quotation.id, "insert", quotation);
  touchPersistence();
  return { quotation, errors: [] };
}

export function setQuotationStatus(id: UUID, status: QuotationStatus): { quotation: Quotation | null; error?: string } {
  assertPermission("sales.create");
  const q = getQuotation(id);
  if (!q) return { quotation: null, error: "Not found" };
  if (q.status === "converted") return { quotation: null, error: "Already converted" };
  q.status = status;
  q.updatedAt = nowISO();
  q.version += 1;
  enqueueOutbox("quotations", q.id, "update", q);
  touchPersistence();
  return { quotation: q };
}

export function convertQuotationToSale(id: UUID): { saleId?: UUID; error?: string } {
  assertPermission("sales.create");
  const q = getQuotation(id);
  if (!q) return { error: "Not found" };
  if (q.status === "converted") return { error: "Already converted" };
  const productLines = q.lines.filter((l) => l.kind === "product" && l.productId);
  if (!productLines.length) return { error: "No product lines to convert to sale" };
  const cartLines = productLines.map((l) => {
    const p = mainStore.getProduct(l.productId!);
    return {
      productId: l.productId!,
      productName: l.description,
      sku: p?.sku ?? null,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      costPrice: p?.costPrice ?? 0,
      discountPercent: 0,
      taxRate: 0,
    };
  });
  const result = mainStore.createSale({
    customerId: q.customerId,
    lines: cartLines as never,
    paidAmount: q.advance,
    paymentMethod: "cash",
    notes: `From quotation ${q.quotationNumber}`,
  });
  if (result.errors.length) return { error: result.errors.join("; ") };
  q.status = "converted";
  q.convertedSaleId = result.sale.id;
  q.updatedAt = nowISO();
  q.version += 1;
  touchPersistence();
  return { saleId: result.sale.id };
}

export function convertQuotationToOrder(id: UUID, serviceType: string = "ladies_tailoring"): { orderId?: UUID; error?: string } {
  assertPermission("orders.manage");
  const q = getQuotation(id);
  if (!q) return { error: "Not found" };
  if (q.status === "converted") return { error: "Already converted" };
  const result = ordersStore.createOrder({
    customerId: q.customerId,
    serviceType: serviceType as never,
    price: q.total,
    discount: q.discount,
    advance: q.advance,
    notes: `From quotation ${q.quotationNumber}. ${q.notes || ""}`,
  });
  if (result.errors.length) return { error: result.errors.join("; ") };
  q.status = "converted";
  q.convertedOrderId = result.order!.id;
  q.updatedAt = nowISO();
  q.version += 1;
  touchPersistence();
  return { orderId: result.order!.id };
}

function quotationTemplateId(paper: PrintPaper): string {
  const settings = getPrintSettings();
  return paper === "a4" ? settings.quotationA4TemplateId : settings.quotationThermalTemplateId;
}

function quotationFont(template: PrintTemplate): string {
  if (template.fontFamily === "serif") return "Georgia, 'Times New Roman', serif";
  if (template.fontFamily === "mono") return "'Courier New', monospace";
  return "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
}

export function buildQuotationHtml(
  q: Quotation,
  opts?: { paper?: PrintPaper; autoPrint?: boolean; templateId?: string | null },
): string {
  const shop = getShopProfile();
  const settings = getPrintSettings();
  const paper = opts?.paper ?? settings.defaultInvoicePaper;
  const template = getPrintTemplate("quotation", paper, opts?.templateId || quotationTemplateId(paper));
  const customer = mainStore.getCustomer(q.customerId);
  const width = paper === "thermal" ? `${settings.thermalWidthMm}mm` : "210mm";
  const compact = paper === "thermal" || template.density === "compact";
  const cellPad = paper === "thermal" ? "3px 2px" : compact ? "5px 4px" : "7px 5px";

  const address = template.showAddress
    ? [shop.address, shop.addressLine2, [shop.district, shop.state, shop.postalCode].filter(Boolean).join(", "), shop.country]
        .filter(Boolean).map((line) => `<div>${escapeHtml(line)}</div>`).join("")
    : "";
  const contacts = [
    template.showPhone && shop.phone ? `Tel: ${escapeHtml(shop.phone)}` : "",
    template.showEmail && shop.email ? escapeHtml(shop.email) : "",
    template.showWebsite && shop.website ? escapeHtml(shop.website) : "",
    template.showGstin && shop.gstin ? `GSTIN: ${escapeHtml(shop.gstin)}` : "",
  ].filter(Boolean).map((line) => `<div>${line}</div>`).join("");

  const headers = [
    `<th>${escapeHtml(template.labels.item)}</th>`,
    `<th class="r">${escapeHtml(template.labels.qty)}</th>`,
    `<th class="r">${escapeHtml(template.labels.rate)}</th>`,
    `<th class="r">${escapeHtml(template.labels.amount)}</th>`,
  ].join("");
  const rows = q.lines.map((line) =>
    `<tr><td>${escapeHtml(line.description)}</td><td class="r">${line.quantity}</td><td class="r">${formatMoney(line.unitPrice)}</td><td class="r">${formatMoney(line.lineTotal)}</td></tr>`
  ).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(q.quotationNumber)}</title>
<style>
*{box-sizing:border-box}body{font-family:${quotationFont(template)};margin:0;padding:${paper === "thermal" ? "4mm 2mm" : "12mm"};color:#0f172a;font-size:${paper === "thermal" ? 10 : compact ? 11 : 12}px;background:white}
.sheet{width:100%;max-width:${width};margin:0 auto}.brand{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid ${template.accentColor};padding-bottom:10px}.brand h1{font-size:${paper === "thermal" ? 15 : 22}px;margin:0 0 3px}
.meta{color:#475569;font-size:${paper === "thermal" ? 8.5 : 10.5}px;line-height:1.45}.doc{text-align:right;min-width:${paper === "thermal" ? "110px" : "180px"}}.doc-title{font-size:${paper === "thermal" ? 13 : 20}px;font-weight:800;color:${template.accentColor}}
.section{margin-top:${paper === "thermal" ? "8px" : "14px"}}.label{font-size:9px;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:.05em}
table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#f8fafc;color:#334155;font-size:${paper === "thermal" ? 8.5 : 10}px;text-transform:uppercase}th,td{border-bottom:1px solid #e2e8f0;padding:${cellPad};text-align:left;vertical-align:top}.r{text-align:right;white-space:nowrap}
.summary{margin-left:auto;width:${paper === "thermal" ? "100%" : "48%"}}.summary td:first-child{color:#475569}.grand td{font-size:${paper === "thermal" ? 12 : 15}px;font-weight:800;border-top:2px solid ${template.accentColor}}
.note,.terms{white-space:pre-wrap;color:#475569;font-size:${paper === "thermal" ? 8.5 : 10.5}px}.footer{margin-top:16px;border-top:1px solid #e2e8f0;padding-top:10px;text-align:center;color:#64748b;font-size:${paper === "thermal" ? 8 : 10}px}
.sign{margin-top:30px;text-align:right}.sign-line{display:inline-block;min-width:150px;border-top:1px solid #64748b;padding-top:5px;text-align:center}@media print{body{padding:0}.sheet{max-width:none}}
</style></head><body><div class="sheet">
<div class="brand"><div><h1>${escapeHtml(shop.shopName || "Minarva Biz")}</h1>
${template.showLegalName && shop.legalName && shop.legalName !== shop.shopName ? `<div class="meta">${escapeHtml(shop.legalName)}</div>` : ""}
<div class="meta">${address}${contacts}</div></div>
<div class="doc"><div class="doc-title">${escapeHtml(template.title || "QUOTATION")}</div><div><strong>${escapeHtml(template.labels.documentNumber)}</strong> ${escapeHtml(q.quotationNumber)}</div>
<div class="meta"><strong>${escapeHtml(template.labels.date)}</strong> ${new Date(q.createdAt).toLocaleString("en-IN")}</div>
<div class="meta"><strong>${escapeHtml(template.labels.status)}</strong> ${escapeHtml(q.status)}</div></div></div>
${template.headerText ? `<div class="section note">${escapeHtml(template.headerText)}</div>` : ""}
<div class="section"><div class="label">${escapeHtml(template.labels.customer)}</div><strong>${escapeHtml(q.customerName || "")}</strong>
${template.showCustomerAddress && customer?.address ? `<div class="meta">${escapeHtml(customer.address)}</div>` : ""}
${customer?.phone ? `<div class="meta">${escapeHtml(customer.phone)}</div>` : ""}
${q.validUntil ? `<div class="meta"><strong>${escapeHtml(template.labels.validUntil)}:</strong> ${escapeHtml(q.validUntil)}</div>` : ""}</div>
<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
<table class="summary">
${q.materialCharges ? `<tr><td>${escapeHtml(template.labels.material)}</td><td class="r">${formatMoney(q.materialCharges)}</td></tr>` : ""}
${q.labourCharges ? `<tr><td>${escapeHtml(template.labels.labour)}</td><td class="r">${formatMoney(q.labourCharges)}</td></tr>` : ""}
<tr><td>${escapeHtml(template.labels.subtotal)}</td><td class="r">${formatMoney(q.subtotal)}</td></tr>
${template.showDiscount && q.discount ? `<tr><td>${escapeHtml(template.labels.discount)}</td><td class="r">-${formatMoney(q.discount)}</td></tr>` : ""}
${template.showTax && q.tax ? `<tr><td>${escapeHtml(template.labels.tax)}</td><td class="r">${formatMoney(q.tax)}</td></tr>` : ""}
<tr class="grand"><td>${escapeHtml(template.labels.total)}</td><td class="r">${formatMoney(q.total)}</td></tr>
${template.showPaymentSummary ? `<tr><td>${escapeHtml(template.labels.advance)}</td><td class="r">${formatMoney(q.advance)}</td></tr><tr><td>${escapeHtml(template.labels.balance)}</td><td class="r">${formatMoney(q.balance)}</td></tr>` : ""}
</table>
${template.showNotes && q.notes ? `<div class="section note"><strong>${escapeHtml(template.labels.notes)}:</strong> ${escapeHtml(q.notes)}</div>` : ""}
${template.showTerms && template.termsText ? `<div class="section terms"><strong>Terms:</strong> ${escapeHtml(template.termsText)}</div>` : ""}
${template.showAuthorizedSignatory ? `<div class="sign"><span class="sign-line">Authorized Signatory</span></div>` : ""}
<div class="footer">${escapeHtml(template.footerText || shop.receiptFooter || "Thank you for your business.")}</div>
</div>${opts?.autoPrint === true ? "<script>window.onload=function(){window.print&&window.print()}</script>" : ""}</body></html>`;
}

export function printQuotation(q: Quotation, paper?: PrintPaper) {
  if (typeof window === "undefined") return;
  const selectedPaper = paper ?? getPrintSettings().defaultInvoicePaper;
  const html = buildQuotationHtml(q, { paper: selectedPaper, autoPrint: false });
  if (tryDesktopPrintHtml(html, selectedPaper)) return;
  const w = window.open("", "_blank", selectedPaper === "thermal" ? "width=420,height=700" : "width=900,height=900");
  if (!w) return;
  w.document.write(buildQuotationHtml(q, { paper: selectedPaper, autoPrint: true }));
  w.document.close();
}

export function hydrateQuotations(data: { quotations?: Quotation[]; lastQuo?: number }) {
  if (data.quotations) {
    quotations.length = 0;
    quotations.push(...data.quotations);
  }
}

export function exportQuotationsState() {
  return { quotations: [...quotations] };
}
