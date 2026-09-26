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
import { getPrintSettings, getPrintTemplate } from "./print-settings";
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

export function buildQuotationHtml(q: Quotation, opts?: { paper?: PrintPaper; autoPrint?: boolean }): string {
  const shop = getShopProfile();
  const settings = getPrintSettings();
  const paper = opts?.paper ?? settings.defaultInvoicePaper;
  const template = getPrintTemplate("quotation", paper);
  const autoPrint = opts?.autoPrint === true;
  const width = paper === "thermal" ? `${settings.thermalWidthMm}mm` : "210mm";
  const compact = paper === "thermal" || template.layout === "compact";
  const address = [shop.address, shop.addressLine2, shop.district, shop.state, shop.postalCode, shop.country].filter(Boolean).join(", ");
  const contacts = [
    template.showPhone && shop.phone ? `Tel: ${shop.phone}` : "",
    template.showEmail && shop.email ? shop.email : "",
    template.showWebsite && shop.website ? shop.website : "",
  ].filter(Boolean).join(" · ");
  const rows = q.lines.map((line) => `
    <tr>
      <td>${escapeHtml(line.description)}</td>
      <td class="r">${line.quantity}</td>
      <td class="r nowrap">${formatMoney(line.unitPrice)}</td>
      <td class="r nowrap">${formatMoney(line.lineTotal)}</td>
    </tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(q.quotationNumber)}</title>
<style>
*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#0f172a;background:#fff;font-size:${(compact?11:13)*template.fontScale}px}
.sheet{width:100%;max-width:${width};margin:0 auto;padding:${compact?"3mm":"12mm"}}
.brand{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:2px solid ${template.accentColor};padding-bottom:${compact?7:12}px}
.business-name{font-size:${compact?15:22}px;font-weight:800}.legal,.muted{color:#64748b;font-size:${compact?9:11}px;line-height:1.45}
.doc{text-align:right;min-width:${compact?100:170}px}.doc-title{font-size:${compact?13:20}px;font-weight:800;color:${template.accentColor}}
.customer{margin:${compact?8:14}px 0;padding:${compact?6:10}px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px}
table{width:100%;border-collapse:collapse;margin-top:${compact?7:12}px}th{background:#f8fafc;color:#334155;font-size:${compact?9:11}px}
th,td{border-bottom:1px solid #e2e8f0;padding:${compact?"4px 2px":"7px 5px"};text-align:left}.r{text-align:right}.nowrap{white-space:nowrap}
.totals{margin-left:auto;width:${compact?"100%":"50%"}}.grand td{font-weight:800;font-size:${compact?12:15}px;border-top:2px solid ${template.accentColor}}
.notes,.terms{margin-top:${compact?8:14}px;color:#475569;font-size:${compact?9:11}px;white-space:pre-wrap}.signature{margin-top:32px;text-align:right;font-size:11px;color:#475569}
.footer{margin-top:${compact?10:18}px;text-align:center;color:#64748b;font-size:${compact?9:10}px;border-top:1px solid #e2e8f0;padding-top:8px}@media print{body{padding:0}}
</style></head><body><div class="sheet">
<div class="brand"><div>
<div class="business-name">${escapeHtml(shop.shopName || "Minarva Biz")}</div>
${template.showLegalName && shop.legalName ? `<div class="legal">${escapeHtml(shop.legalName)}</div>` : ""}
${template.subheading ? `<div class="muted">${escapeHtml(template.subheading)}</div>` : ""}
${template.showAddress && address ? `<div class="muted">${escapeHtml(address)}</div>` : ""}
${contacts ? `<div class="muted">${escapeHtml(contacts)}</div>` : ""}
${template.showGstin && shop.gstin ? `<div class="muted"><strong>GSTIN:</strong> ${escapeHtml(shop.gstin)}</div>` : ""}
</div><div class="doc">
<div class="doc-title">${escapeHtml(template.heading || "QUOTATION")}</div>
<div><strong>${escapeHtml(q.quotationNumber)}</strong></div>
<div class="muted">${new Date(q.createdAt).toLocaleString("en-IN")}</div>
<div class="muted">Valid until: ${escapeHtml(q.validUntil || "—")}</div>
</div></div>
${template.showCustomer ? `<div class="customer"><div class="muted">Prepared for</div><strong>${escapeHtml(q.customerName || "")}</strong><div class="muted">Status: ${escapeHtml(q.status)}</div></div>` : ""}
<table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<table class="totals">
${q.materialCharges ? `<tr><td>Material charges</td><td class="r">${formatMoney(q.materialCharges)}</td></tr>` : ""}
${q.labourCharges ? `<tr><td>Labour charges</td><td class="r">${formatMoney(q.labourCharges)}</td></tr>` : ""}
<tr><td>Subtotal</td><td class="r">${formatMoney(q.subtotal)}</td></tr>
${q.discount ? `<tr><td>Discount</td><td class="r">-${formatMoney(q.discount)}</td></tr>` : ""}
${template.showTax && q.tax ? `<tr><td>GST / Tax</td><td class="r">${formatMoney(q.tax)}</td></tr>` : ""}
<tr class="grand"><td>Total</td><td class="r">${formatMoney(q.total)}</td></tr>
${template.showPaymentSummary ? `<tr><td>Advance</td><td class="r">${formatMoney(q.advance)}</td></tr><tr><td>Balance</td><td class="r">${formatMoney(q.balance)}</td></tr>` : ""}
</table>
${template.showNotes && q.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(q.notes)}</div>` : ""}
${template.showTerms && template.termsText ? `<div class="terms"><strong>Terms:</strong> ${escapeHtml(template.termsText)}</div>` : ""}
${template.showSignature && paper === "a4" ? `<div class="signature">For ${escapeHtml(shop.shopName || "Business")}<br/><br/><strong>Authorised Signatory</strong></div>` : ""}
<div class="footer">${escapeHtml(template.footerText || shop.receiptFooter || "Thank you.")}</div>
</div>${autoPrint ? "<script>window.onload=function(){window.print&&window.print()}</script>" : ""}</body></html>`;
}

export function printQuotation(q: Quotation, paper?: PrintPaper) {
  if (typeof window === "undefined") return;
  const selectedPaper = paper ?? getPrintSettings().defaultInvoicePaper;
  const directHtml = buildQuotationHtml(q, { paper: selectedPaper, autoPrint: false });
  if (tryDesktopPrintHtml(directHtml, selectedPaper)) return;
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
