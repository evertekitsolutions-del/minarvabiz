/**
 * Quotation / estimate system
 */
import type { Quotation, QuotationLine, QuotationStatus, UUID } from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { enqueueOutbox } from "./outbox-bridge";
import * as mainStore from "./store";
import * as ordersStore from "./orders-store";

const quotations: Quotation[] = [];
let lastQuo = 0;

function nextQuotationNumber(): string {
  lastQuo += 1;
  const y = new Date().getFullYear();
  return `QT-${y}-${String(lastQuo).padStart(5, "0")}`;
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

export function buildQuotationHtml(q: Quotation): string {
  const rows = q.lines
    .map(
      (l) =>
        `<tr><td>${l.description}</td><td>${l.quantity}</td><td>${l.unitPrice}</td><td>${l.lineTotal}</td></tr>`
    )
    .join("");
  return `<!DOCTYPE html><html><head><title>${q.quotationNumber}</title>
<style>body{font-family:system-ui;padding:16px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e2e8f0;padding:6px;text-align:left}</style></head>
<body><h1>Quotation ${q.quotationNumber}</h1>
<p>Customer: ${q.customerName || ""} · Status: ${q.status}</p>
<p>Valid until: ${q.validUntil || "—"}</p>
<table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
<tbody>${rows}</tbody></table>
<p>Material: ${q.materialCharges} · Labour: ${q.labourCharges}</p>
<p>Subtotal: ${q.subtotal} · Discount: ${q.discount} · Tax: ${q.tax}</p>
<p><strong>Total: ${q.total}</strong> · Advance: ${q.advance} · Balance: ${q.balance}</p>
<script>window.onload=function(){window.print()}</script></body></html>`;
}

export function printQuotation(q: Quotation) {
  if (typeof window === "undefined") return;
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return;
  w.document.write(buildQuotationHtml(q));
  w.document.close();
}

export function hydrateQuotations(data: { quotations?: Quotation[]; lastQuo?: number }) {
  if (data.quotations) {
    quotations.length = 0;
    quotations.push(...data.quotations);
  }
  if (typeof data.lastQuo === "number") lastQuo = data.lastQuo;
}

export function exportQuotationsState() {
  return { quotations: [...quotations], lastQuo };
}
