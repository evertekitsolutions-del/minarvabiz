export type PrintDocumentKind = "invoice" | "quotation";
export type PrintPaper = "a4" | "thermal";
export type PrintTemplateLayout = "modern" | "classic" | "compact";

export interface PrintDocumentTemplate {
  id: string;
  name: string;
  documentKind: PrintDocumentKind;
  paper: PrintPaper;
  layout: PrintTemplateLayout;
  isDefault: boolean;
  isSystem: boolean;
  heading: string;
  subheading: string;
  footerText: string;
  termsText: string;
  signatureLabel: string;
  showLegalName: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showWebsite: boolean;
  showGstin: boolean;
  showCustomer: boolean;
  showSku: boolean;
  showTax: boolean;
  showPaymentSummary: boolean;
  showNotes: boolean;
  showTerms: boolean;
  showSignature: boolean;
  signatureLabel: string;
  accentColor: string;
  fontScale: number;
}

const professionalBase = {
  layout: "modern" as const,
  isDefault: true,
  isSystem: true,
  subheading: "",
  footerText: "Thank you for your business.",
  termsText: "Goods once sold are subject to the seller's applicable return policy. Please retain this document for reference.",
  showLegalName: true,
  showAddress: true,
  showPhone: true,
  showEmail: true,
  showWebsite: true,
  showGstin: true,
  showCustomer: true,
  showSku: true,
  showTax: true,
  showPaymentSummary: true,
  showNotes: true,
  showTerms: true,
  showSignature: true,
  signatureLabel: "Authorised Signatory",
  accentColor: "#1d4ed8",
  fontScale: 1,
};

export function defaultPrintTemplates(): PrintDocumentTemplate[] {
  const templates: PrintDocumentTemplate[] = [
    {
      ...professionalBase,
      id: "system-invoice-a4",
      name: "Professional Invoice — A4",
      documentKind: "invoice",
      paper: "a4",
      heading: "TAX INVOICE",
    },
    {
      ...professionalBase,
      id: "system-invoice-thermal",
      name: "Professional Invoice — Thermal",
      documentKind: "invoice",
      paper: "thermal",
      layout: "compact",
      heading: "INVOICE",
      showSignature: false,
      termsText: "Thank you. Please retain this receipt.",
    },
    {
      ...professionalBase,
      id: "system-quotation-a4",
      name: "Professional Quotation — A4",
      documentKind: "quotation",
      paper: "a4",
      heading: "QUOTATION",
      termsText: "This quotation is subject to availability and remains valid until the validity date shown above unless otherwise agreed.",
    },
    {
      ...professionalBase,
      id: "system-quotation-thermal",
      name: "Professional Quotation — Thermal",
      documentKind: "quotation",
      paper: "thermal",
      layout: "compact",
      heading: "QUOTATION",
      showSignature: false,
      termsText: "Quotation subject to availability and stated validity.",
    },
  ];
  return templates.map((item) => ({ ...item }));
}

function safeColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : "#1d4ed8";
}

export function sanitizePrintTemplate(input: PrintDocumentTemplate): PrintDocumentTemplate {
  return {
    ...input,
    id: String(input.id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || `template-${Date.now()}`,
    name: String(input.name || "Document template").trim().slice(0, 120),
    documentKind: input.documentKind === "quotation" ? "quotation" : "invoice",
    paper: input.paper === "thermal" ? "thermal" : "a4",
    layout: input.layout === "classic" ? "classic" : input.layout === "compact" ? "compact" : "modern",
    heading: String(input.heading || "").trim().slice(0, 80),
    subheading: String(input.subheading || "").trim().slice(0, 160),
    footerText: String(input.footerText || "").trim().slice(0, 500),
    termsText: String(input.termsText || "").trim().slice(0, 2000),
    signatureLabel: String(input.signatureLabel || "Authorised Signatory").trim().slice(0, 120),
    accentColor: safeColor(input.accentColor),
    fontScale: Math.max(0.8, Math.min(1.35, Number(input.fontScale) || 1)),
    isDefault: Boolean(input.isDefault),
    isSystem: Boolean(input.isSystem),
    showLegalName: Boolean(input.showLegalName),
    showAddress: Boolean(input.showAddress),
    showPhone: Boolean(input.showPhone),
    showEmail: Boolean(input.showEmail),
    showWebsite: Boolean(input.showWebsite),
    showGstin: Boolean(input.showGstin),
    showCustomer: Boolean(input.showCustomer),
    showSku: Boolean(input.showSku),
    showTax: Boolean(input.showTax),
    showPaymentSummary: Boolean(input.showPaymentSummary),
    showNotes: Boolean(input.showNotes),
    showTerms: Boolean(input.showTerms),
    showSignature: Boolean(input.showSignature),
    signatureLabel: String(input.signatureLabel || "Authorised Signatory").trim().slice(0, 120),
  };
}

export function normalizePrintTemplates(value: unknown): PrintDocumentTemplate[] {
  const defaults = defaultPrintTemplates();
  if (!Array.isArray(value) || !value.length) return defaults;
  const parsed = value
    .filter((item): item is PrintDocumentTemplate => Boolean(item && typeof item === "object"))
    .map((item) => sanitizePrintTemplate({ ...professionalBase, ...(item as PrintDocumentTemplate) }));
  for (const fallback of defaults) {
    if (!parsed.some((item) => item.documentKind === fallback.documentKind && item.paper === fallback.paper)) {
      parsed.push(fallback);
    }
  }
  for (const kind of ["invoice", "quotation"] as const) {
    for (const paper of ["a4", "thermal"] as const) {
      const group = parsed.filter((item) => item.documentKind === kind && item.paper === paper);
      if (!group.some((item) => item.isDefault) && group[0]) group[0].isDefault = true;
      let seenDefault = false;
      for (const item of group) {
        if (!item.isDefault) continue;
        if (!seenDefault) seenDefault = true;
        else item.isDefault = false;
      }
    }
  }
  return parsed;
}
