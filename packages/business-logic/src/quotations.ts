/**
 * Quotation / estimate system
 */
import type { Quotation, QuotationLine, QuotationStatus, UUID } from "@minarvabiz/types";
import { formatMoney, generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { enqueueOutbox } from "./outbox-bridge";
import { auditAction } from "./audit-actions";
import * as mainStore from "./store";
import * as ordersStore from "./orders-store";
import { escapeHtml } from "./html";
import { getShopProfile } from "./shop-profile";
import { nextBusinessDocumentNumber } from "./document-numbering";
import { getPrintSettings, getPrintTemplate, getPrintTemplateById } from "./print-settings";
import { businessHeaderHtml, customerBlockHtml, documentCss, documentFooterHtml } from "./print-document-render";
import { tryDesktopPrintHtml } from "./desktop-print";
import type { PrintPaper } from "./print-templates";

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

export function listQuotations(opts?: { status?: QuotationStatus; customerId?: UUID; query?: string; dateFrom?: string; dateTo?: string }): Quotation[] {
  let list = quotations.filter((q) => !q.deletedAt);
  if (opts?.status) list = list.filter((q) => q.status === opts.status);
  if (opts?.customerId) list = list.filter((q) => q.customerId === opts.customerId);
  if (opts?.dateFrom) list = list.filter((q) => q.createdAt.slice(0, 10) >= opts.dateFrom!);
  if (opts?.dateTo) list = list.filter((q) => q.createdAt.slice(0, 10) <= opts.dateTo!);
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
  auditAction("quotation.create", "quotations", quotation.id, null, quotation);
  touchPersistence();
  return { quotation, errors: [] };
}

export function canEditQuotation(q: Quotation): boolean {
  return !q.deletedAt && (q.status === "draft" || q.status === "sent");
}

export function canArchiveQuotation(q: Quotation): boolean {
  return !q.deletedAt && ["draft", "sent", "rejected", "expired"].includes(q.status);
}

export function updateQuotation(id: UUID, input: {
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
  const q = getQuotation(id);
  if (!q) return { quotation: null, errors: ["Quotation not found"] };
  if (!canEditQuotation(q)) return { quotation: null, errors: ["Only draft or sent quotations can be edited"] };
  const customer = mainStore.getCustomer(input.customerId);
  if (!customer) return { quotation: null, errors: ["Customer not found"] };
  if (!input.lines.length) return { quotation: null, errors: ["Add at least one line"] };
  if (input.lines.some((line) => !line.description.trim() || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0)) {
    return { quotation: null, errors: ["Quotation lines must have a description, positive quantity and valid price"] };
  }

  const before = structuredClone(q);
  const lines: QuotationLine[] = input.lines.map((line) => ({
    id: generateId(),
    kind: line.kind,
    productId: line.productId ?? null,
    description: line.description.trim(),
    quantity: round2(line.quantity),
    unitPrice: round2(line.unitPrice),
    lineTotal: round2(line.quantity * line.unitPrice),
  }));
  const linesSum = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const materialCharges = round2(input.materialCharges ?? 0);
  const labourCharges = round2(input.labourCharges ?? 0);
  const subtotal = round2(linesSum + materialCharges + labourCharges);
  const discount = round2(input.discount ?? 0);
  const tax = round2(input.tax ?? 0);
  const total = round2(subtotal - discount + tax);
  const advance = round2(input.advance ?? 0);

  q.customerId = input.customerId;
  q.customerName = customer.name;
  q.lines = lines;
  q.materialCharges = materialCharges;
  q.labourCharges = labourCharges;
  q.subtotal = subtotal;
  q.discount = discount;
  q.tax = tax;
  q.total = total;
  q.advance = advance;
  q.balance = round2(total - advance);
  q.validUntil = input.validUntil ?? null;
  q.notes = input.notes?.trim() || null;
  q.updatedAt = nowISO();
  q.version += 1;

  enqueueOutbox("quotations", q.id, "update", q);
  auditAction("quotation.update", "quotations", q.id, before, q);
  touchPersistence();
  return { quotation: q, errors: [] };
}

export function archiveQuotation(id: UUID, reason: string): { quotation: Quotation | null; error?: string } {
  assertPermission("sales.create");
  const q = getQuotation(id);
  if (!q) return { quotation: null, error: "Quotation not found" };
  if (!canArchiveQuotation(q)) return { quotation: null, error: "Accepted or converted quotations cannot be archived" };
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 3) return { quotation: null, error: "Archive reason is required" };
  const before = structuredClone(q);
  q.deletedAt = nowISO();
  q.updatedAt = q.deletedAt;
  q.version += 1;
  enqueueOutbox("quotations", q.id, "update", q);
  auditAction("quotation.archive", "quotations", q.id, before, { ...q, archiveReason: trimmedReason });
  touchPersistence();
  return { quotation: q };
}

export function setQuotationStatus(id: UUID, status: QuotationStatus): { quotation: Quotation | null; error?: string } {
  assertPermission("sales.create");
  const q = getQuotation(id);
  if (!q) return { quotation: null, error: "Not found" };
  if (q.status === "converted") return { quotation: null, error: "Already converted" };
  const before = structuredClone(q);
  q.status = status;
  q.updatedAt = nowISO();
  q.version += 1;
  enqueueOutbox("quotations", q.id, "update", q);
  auditAction("quotation.status", "quotations", q.id, before, q);
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
  const before = structuredClone(q);
  q.status = "converted";
  q.convertedSaleId = result.sale.id;
  q.updatedAt = nowISO();
  q.version += 1;
  enqueueOutbox("quotations", q.id, "update", q);
  auditAction("quotation.convert_sale", "quotations", q.id, before, q);
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
  const before = structuredClone(q);
  q.status = "converted";
  q.convertedOrderId = result.order!.id;
  q.updatedAt = nowISO();
  q.version += 1;
  enqueueOutbox("quotations", q.id, "update", q);
  auditAction("quotation.convert_order", "quotations", q.id, before, q);
  touchPersistence();
  return { orderId: result.order!.id };
}

export function buildQuotationHtml(
  q: Quotation,
  opts?: { paper?: PrintPaper; autoPrint?: boolean; templateId?: string },
): string {
  const settings = getPrintSettings();
  const paper = opts?.paper ?? settings.defaultInvoicePaper;
  const template = (opts?.templateId ? getPrintTemplateById(opts.templateId) : null) ?? getPrintTemplate("quotation", paper);
  const width = paper === "thermal" ? `${settings.thermalWidthMm}mm` : "210mm";
  const autoPrint = opts?.autoPrint === true;
  const customer = mainStore.getCustomer(q.customerId);
  const rows = q.lines.map((line, index) => `<tr>
    <td class="c">${index + 1}</td>
    <td>${escapeHtml(line.description)}${template.showSku && line.productId ? `<div class="meta">Ref: ${escapeHtml(line.productId.slice(0, 8))}</div>` : ""}</td>
    <td class="r">${line.quantity}</td>
    <td class="r nowrap">${formatMoney(line.unitPrice)}</td>
    <td class="r nowrap">${formatMoney(line.lineTotal)}</td>
  </tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(q.quotationNumber)}</title>
<style>${documentCss(template, width)}</style></head><body><div class="sheet">
${businessHeaderHtml(template, {
  number: q.quotationNumber,
  date: q.createdAt,
  fallbackTitle: "QUOTATION",
  extraMeta: q.validUntil ? `Valid until: ${new Date(q.validUntil).toLocaleDateString("en-IN")}` : `Status: ${q.status}`,
})}
${customerBlockHtml(template, customer, q.customerName || "")}
<table><thead><tr><th class="c">#</th><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<table class="totals">
${q.materialCharges ? `<tr><td>Material charges</td><td class="r">${formatMoney(q.materialCharges)}</td></tr>` : ""}
${q.labourCharges ? `<tr><td>Labour charges</td><td class="r">${formatMoney(q.labourCharges)}</td></tr>` : ""}
<tr><td>Subtotal</td><td class="r">${formatMoney(q.subtotal)}</td></tr>
${q.discount ? `<tr><td>Discount</td><td class="r">− ${formatMoney(q.discount)}</td></tr>` : ""}
${template.showTax && q.tax ? `<tr><td>GST / Tax</td><td class="r">${formatMoney(q.tax)}</td></tr>` : ""}
<tr class="grand"><td>Total</td><td class="r">${formatMoney(q.total)}</td></tr>
${template.showPaymentSummary ? `<tr><td>Advance</td><td class="r">${formatMoney(q.advance)}</td></tr><tr><td>Balance</td><td class="r">${formatMoney(q.balance)}</td></tr>` : ""}
</table>
${documentFooterHtml(template, q.notes)}
</div>${autoPrint ? "<script>window.onload=function(){window.print&&window.print()}</script>" : ""}</body></html>`;
}

export function printQuotation(q: Quotation, paper?: PrintPaper, templateId?: string) {
  if (typeof window === "undefined") return;
  const selectedPaper = paper ?? getPrintSettings().defaultInvoicePaper;
  const directHtml = buildQuotationHtml(q, { paper: selectedPaper, autoPrint: false, templateId });
  if (tryDesktopPrintHtml(directHtml, selectedPaper)) return;
  const w = window.open("", "_blank", selectedPaper === "thermal" ? "width=420,height=700" : "width=900,height=900");
  if (!w) return;
  w.document.write(buildQuotationHtml(q, { paper: selectedPaper, autoPrint: true, templateId }));
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
