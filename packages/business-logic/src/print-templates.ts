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
  accentColor: "#1d4ed8",
  fontScale: 1,
};

export function defaultPrintTemplates(): PrintDocumentTemplate[] {
  return [
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
  ].map((item) => ({ ...item }));
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


function sampleEscape(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}

export function buildTemplateSampleHtml(template: PrintDocumentTemplate): string {
  const clean = sanitizePrintTemplate(template);
  const compact = clean.paper === "thermal" || clean.layout === "compact";
  const width = clean.paper === "thermal" ? "80mm" : "210mm";
  const title = clean.heading || (clean.documentKind === "quotation" ? "QUOTATION" : "TAX INVOICE");
  const number = clean.documentKind === "quotation" ? "QT-MT-2026-27-00001" : "INV-MT-2026-27-00001";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Template Preview</title>
<style>
*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#0f172a;background:#fff;font-size:${(compact?11:13)*clean.fontScale}px}
.sheet{width:100%;max-width:${width};margin:0 auto;padding:${compact?"3mm":"12mm"}}
.brand{display:flex;justify-content:space-between;gap:14px;border-bottom:2px solid ${clean.accentColor};padding-bottom:${compact?7:12}px}.name{font-size:${compact?15:22}px;font-weight:800}.muted{color:#64748b;font-size:${compact?9:11}px;line-height:1.45}.doc{text-align:right}.title{color:${clean.accentColor};font-size:${compact?13:20}px;font-weight:800}
.box{margin:${compact?8:14}px 0;padding:${compact?6:10}px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:6px}table{width:100%;border-collapse:collapse}th,td{padding:${compact?"4px 2px":"7px 5px"};border-bottom:1px solid #e2e8f0;text-align:left}.r{text-align:right}.total{font-weight:800;border-top:2px solid ${clean.accentColor}}.footer{margin-top:16px;padding-top:8px;border-top:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:10px}.terms{margin-top:12px;color:#475569;font-size:${compact?9:11}px}.sig{text-align:right;margin-top:28px;color:#475569;font-size:11px}
</style></head><body><div class="sheet">
<div class="brand"><div><div class="name">Minarva Technologies</div>
${clean.showLegalName?'<div class="muted">Minarva Technologies Private Limited</div>':""}
${clean.subheading?`<div class="muted">${sampleEscape(clean.subheading)}</div>`:""}
${clean.showAddress?'<div class="muted">Vellayani Junction, Nemom, Thiruvananthapuram, Kerala 695020, India</div>':""}
${clean.showPhone||clean.showEmail||clean.showWebsite?'<div class="muted">+91 98765 43210 · billing@example.com · example.com</div>':""}
${clean.showGstin?'<div class="muted"><strong>GSTIN:</strong> 32ABCDE1234F1Z5</div>':""}
</div><div class="doc"><div class="title">${sampleEscape(title)}</div><strong>${number}</strong><div class="muted">26/09/2026 11:00 AM</div></div></div>
${clean.showCustomer?'<div class="box"><div class="muted">Customer</div><strong>Sample Customer</strong><div class="muted">Thiruvananthapuram, Kerala</div></div>':""}
<table><thead><tr><th>Item</th>${clean.showSku?'<th>SKU</th>':""}<th class="r">Qty</th><th class="r">Rate</th>${clean.showTax?'<th class="r">Tax</th>':""}<th class="r">Amount</th></tr></thead>
<tbody><tr><td>Sample Product</td>${clean.showSku?'<td>SKU-001</td>':""}<td class="r">2</td><td class="r">₹500.00</td>${clean.showTax?'<td class="r">5%</td>':""}<td class="r">₹1,000.00</td></tr></tbody></table>
<table style="margin-top:10px"><tr><td>Subtotal</td><td class="r">₹1,000.00</td></tr>${clean.showTax?'<tr><td>GST / Tax</td><td class="r">₹50.00</td></tr>':""}<tr class="total"><td>Total</td><td class="r">₹1,050.00</td></tr>${clean.showPaymentSummary?'<tr><td>Paid / Advance</td><td class="r">₹500.00</td></tr><tr><td>Balance</td><td class="r">₹550.00</td></tr>':""}</table>
${clean.showNotes?'<div class="terms"><strong>Notes:</strong> Sample document notes.</div>':""}
${clean.showTerms&&clean.termsText?`<div class="terms"><strong>Terms:</strong> ${sampleEscape(clean.termsText)}</div>`:""}
${clean.showSignature&&clean.paper==="a4"?'<div class="sig">For Minarva Technologies<br/><br/><strong>Authorised Signatory</strong></div>':""}
<div class="footer">${sampleEscape(clean.footerText || "Thank you for your business.")}</div>
</div></body></html>`;
}
