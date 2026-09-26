import { generateId, nowISO } from "@minarvabiz/utils";
import { touchPersistence } from "./autosave";

export type PrintDocumentType = "invoice" | "quotation";
export type PrintPaper = "a4" | "thermal";

export interface PrintTemplateLabels {
  customer: string;
  date: string;
  documentNumber: string;
  item: string;
  sku: string;
  qty: string;
  rate: string;
  discount: string;
  tax: string;
  amount: string;
  subtotal: string;
  total: string;
  paid: string;
  balance: string;
  advance: string;
  material: string;
  labour: string;
  validUntil: string;
  notes: string;
  status: string;
}

export interface PrintTemplate {
  id: string;
  name: string;
  documentType: PrintDocumentType;
  paper: PrintPaper;
  title: string;
  headerText: string;
  footerText: string;
  termsText: string;
  accentColor: string;
  fontFamily: "system" | "serif" | "mono";
  density: "comfortable" | "compact";
  showLegalName: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showWebsite: boolean;
  showGstin: boolean;
  showCustomerAddress: boolean;
  showSku: boolean;
  showDiscount: boolean;
  showTax: boolean;
  showPaymentSummary: boolean;
  showNotes: boolean;
  showTerms: boolean;
  showAuthorizedSignatory: boolean;
  labels: PrintTemplateLabels;
  createdAt: string;
  updatedAt: string;
}

const labels: PrintTemplateLabels = {
  customer: "Customer",
  date: "Date",
  documentNumber: "Document No.",
  item: "Item / Description",
  sku: "SKU",
  qty: "Qty",
  rate: "Rate",
  discount: "Discount",
  tax: "Tax",
  amount: "Amount",
  subtotal: "Subtotal",
  total: "Total",
  paid: "Paid",
  balance: "Balance",
  advance: "Advance",
  material: "Material",
  labour: "Labour",
  validUntil: "Valid Until",
  notes: "Notes",
  status: "Status",
};

function professionalTemplate(documentType: PrintDocumentType, paper: PrintPaper): PrintTemplate {
  const thermal = paper === "thermal";
  const invoice = documentType === "invoice";
  const stamp = nowISO();
  return {
    id: `tpl-${documentType}-${paper}-professional`,
    name: `Professional ${invoice ? "Invoice" : "Quotation"} — ${thermal ? "Thermal" : "A4"}`,
    documentType,
    paper,
    title: invoice ? "TAX INVOICE" : "QUOTATION",
    headerText: invoice ? "" : "We are pleased to submit the following quotation.",
    footerText: "Thank you for your business.",
    termsText: invoice
      ? "Goods once sold will be subject to the business return policy. Please retain this document for reference."
      : "Prices and availability are subject to change after the validity period. Work starts after confirmation and agreed advance payment.",
    accentColor: "#1d4ed8",
    fontFamily: "system",
    density: thermal ? "compact" : "comfortable",
    showLegalName: !thermal,
    showAddress: true,
    showPhone: true,
    showEmail: !thermal,
    showWebsite: !thermal,
    showGstin: true,
    showCustomerAddress: !thermal,
    showSku: !thermal,
    showDiscount: true,
    showTax: true,
    showPaymentSummary: true,
    showNotes: true,
    showTerms: !thermal,
    showAuthorizedSignatory: !thermal,
    labels: { ...labels, documentNumber: invoice ? "Invoice No." : "Quotation No." },
    createdAt: stamp,
    updatedAt: stamp,
  };
}

const templates: PrintTemplate[] = [
  professionalTemplate("invoice", "a4"),
  professionalTemplate("invoice", "thermal"),
  professionalTemplate("quotation", "a4"),
  professionalTemplate("quotation", "thermal"),
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeColor(value: string): string {
  const normalized = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : "#1d4ed8";
}

function ensureKind(documentType: PrintDocumentType, paper: PrintPaper): PrintTemplate {
  const existing = templates.find((template) => template.documentType === documentType && template.paper === paper);
  if (existing) return existing;
  const created = professionalTemplate(documentType, paper);
  templates.push(created);
  touchPersistence();
  return created;
}

export function listPrintTemplates(documentType?: PrintDocumentType, paper?: PrintPaper): PrintTemplate[] {
  return templates
    .filter((template) => (!documentType || template.documentType === documentType) && (!paper || template.paper === paper))
    .map(clone)
    .sort((a, b) => a.documentType.localeCompare(b.documentType) || a.paper.localeCompare(b.paper) || a.name.localeCompare(b.name));
}

export function getPrintTemplate(documentType: PrintDocumentType, paper: PrintPaper, templateId?: string | null): PrintTemplate {
  const selected = templateId ? templates.find((template) => template.id === templateId && template.documentType === documentType && template.paper === paper) : undefined;
  return clone(selected || ensureKind(documentType, paper));
}

export function createPrintTemplate(input: {
  documentType: PrintDocumentType;
  paper: PrintPaper;
  name: string;
  sourceTemplateId?: string | null;
}): PrintTemplate {
  const source = input.sourceTemplateId
    ? templates.find((template) => template.id === input.sourceTemplateId)
    : ensureKind(input.documentType, input.paper);
  const base = source && source.documentType === input.documentType && source.paper === input.paper
    ? source
    : ensureKind(input.documentType, input.paper);
  const stamp = nowISO();
  const created: PrintTemplate = {
    ...clone(base),
    id: generateId(),
    name: input.name.trim() || `Custom ${input.documentType} ${input.paper}`,
    createdAt: stamp,
    updatedAt: stamp,
  };
  templates.push(created);
  touchPersistence();
  return clone(created);
}

export function updatePrintTemplate(id: string, patch: Partial<Omit<PrintTemplate, "id" | "documentType" | "paper" | "createdAt">>): PrintTemplate | null {
  const index = templates.findIndex((template) => template.id === id);
  if (index < 0) return null;
  const current = templates[index];
  const next: PrintTemplate = {
    ...current,
    ...clone(patch),
    labels: { ...current.labels, ...(patch.labels || {}) },
    name: String(patch.name ?? current.name).trim().slice(0, 120) || current.name,
    title: String(patch.title ?? current.title).slice(0, 120),
    headerText: String(patch.headerText ?? current.headerText).slice(0, 2000),
    footerText: String(patch.footerText ?? current.footerText).slice(0, 2000),
    termsText: String(patch.termsText ?? current.termsText).slice(0, 4000),
    accentColor: sanitizeColor(String(patch.accentColor ?? current.accentColor)),
    updatedAt: nowISO(),
  };
  templates[index] = next;
  touchPersistence();
  return clone(next);
}

export function deletePrintTemplate(id: string): { deleted: boolean; replacement?: PrintTemplate } {
  const index = templates.findIndex((template) => template.id === id);
  if (index < 0) return { deleted: false };
  const removed = templates[index];
  templates.splice(index, 1);
  const replacement = ensureKind(removed.documentType, removed.paper);
  touchPersistence();
  return { deleted: true, replacement: clone(replacement) };
}

export function resetPrintTemplate(id: string): PrintTemplate | null {
  const index = templates.findIndex((template) => template.id === id);
  if (index < 0) return null;
  const current = templates[index];
  const reset = professionalTemplate(current.documentType, current.paper);
  reset.id = current.id;
  reset.name = current.name;
  reset.createdAt = current.createdAt;
  reset.updatedAt = nowISO();
  templates[index] = reset;
  touchPersistence();
  return clone(reset);
}

export function exportPrintTemplatesState() {
  return { templates: listPrintTemplates() };
}

export function hydratePrintTemplatesState(data?: { templates?: PrintTemplate[] } | null) {
  if (!data?.templates?.length) return;
  templates.length = 0;
  for (const raw of data.templates) {
    if (!raw || !raw.id || !["invoice", "quotation"].includes(raw.documentType) || !["a4", "thermal"].includes(raw.paper)) continue;
    templates.push({
      ...professionalTemplate(raw.documentType, raw.paper),
      ...clone(raw),
      labels: { ...labels, ...(raw.labels || {}) },
      accentColor: sanitizeColor(raw.accentColor),
    });
  }
  ensureKind("invoice", "a4");
  ensureKind("invoice", "thermal");
  ensureKind("quotation", "a4");
  ensureKind("quotation", "thermal");
}
