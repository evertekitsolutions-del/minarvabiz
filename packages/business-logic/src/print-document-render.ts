import type { Customer } from "@minarvabiz/types";
import { formatMoney } from "@minarvabiz/utils";
import { escapeHtml } from "./html";
import { getShopProfile } from "./shop-profile";
import { getTaxConfig } from "./tax-config";
import type { PrintDocumentTemplate } from "./print-templates";

function addressLine(): string {
  const shop = getShopProfile();
  return [
    shop.address,
    shop.addressLine2,
    shop.district,
    shop.state,
    shop.postalCode,
    shop.country,
  ].filter(Boolean).join(", ");
}

export function documentCss(template: PrintDocumentTemplate, width: string): string {
  const compact = template.paper === "thermal";
  const accent = template.accentColor;
  const base = Math.round((compact ? 11 : 13) * template.fontScale * 10) / 10;
  const heading = Math.round((compact ? 16 : 22) * template.fontScale);
  const padding = compact ? "3mm" : "12mm";
  const border = template.layout === "classic" ? "#0f172a" : "#e2e8f0";
  return `
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:#0f172a;font-family:Arial,Helvetica,sans-serif;font-size:${base}px}
body{padding:${padding}}
.sheet{max-width:${width};margin:0 auto}
.top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;border-bottom:2px solid ${accent};padding-bottom:10px}
.brand-name{font-size:${heading}px;font-weight:800;line-height:1.1;color:#0f172a}
.legal{font-size:.88em;font-weight:600;margin-top:3px}
.meta,.muted{color:#64748b;font-size:.88em;line-height:1.45}
.doc{text-align:right;min-width:150px}.doc-title{font-size:1.25em;font-weight:800;color:${accent};letter-spacing:.04em}
.doc-no{font-weight:700;margin-top:4px}
.header-note{margin-top:8px;padding:7px 9px;background:#f8fafc;border-left:3px solid ${accent};font-size:.9em}
.party{margin-top:12px;display:flex;justify-content:space-between;gap:16px}
.party-box{flex:1;border:1px solid ${border};border-radius:8px;padding:9px}
.party-label{font-size:.75em;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:4px}
table{width:100%;border-collapse:collapse;margin-top:12px}
th{background:${template.layout === "minimal" ? "#fff" : "#f8fafc"};font-size:.82em;text-transform:uppercase;letter-spacing:.04em}
th,td{border-bottom:1px solid ${border};padding:${compact ? "5px 3px" : "7px 5px"};text-align:left;vertical-align:top}
.r{text-align:right}.c{text-align:center}.nowrap{white-space:nowrap}
.totals{margin-left:auto;max-width:${compact ? "100%" : "340px"}}
.totals td:first-child{color:#475569}.grand td{font-size:1.08em;font-weight:800;border-top:2px solid ${accent}}
.note,.terms{margin-top:12px;border:1px solid ${border};border-radius:8px;padding:9px;font-size:.88em;white-space:pre-wrap}
.sign{margin-top:28px;display:flex;justify-content:flex-end}.sign-box{width:180px;border-top:1px solid #94a3b8;padding-top:5px;text-align:center;font-size:.82em;color:#475569}
.footer{margin-top:18px;padding-top:10px;border-top:1px solid ${border};text-align:center;font-size:.82em;color:#64748b;white-space:pre-wrap}
@media print{body{padding:0}.sheet{max-width:none}.no-print{display:none!important}}
`;
}

export function businessHeaderHtml(
  template: PrintDocumentTemplate,
  input: { number: string; date: string | Date; fallbackTitle: string; extraMeta?: string },
): string {
  const shop = getShopProfile();
  const tax = getTaxConfig();
  const gstin = shop.gstin || tax.gstin;
  const address = addressLine();
  const legal = template.showLegalName && shop.legalName && shop.legalName !== shop.shopName
    ? `<div class="legal">${escapeHtml(shop.legalName)}</div>`
    : "";
  const contacts = [
    template.showAddress && address ? `<div>${escapeHtml(address)}</div>` : "",
    template.showPhone && shop.phone ? `<div>Phone: ${escapeHtml(shop.phone)}</div>` : "",
    template.showEmail && shop.email ? `<div>Email: ${escapeHtml(shop.email)}</div>` : "",
    template.showWebsite && shop.website ? `<div>Web: ${escapeHtml(shop.website)}</div>` : "",
    template.showGstin && gstin ? `<div><strong>GSTIN:</strong> ${escapeHtml(gstin)}</div>` : "",
  ].filter(Boolean).join("");
  const date = new Date(input.date);
  const formatted = Number.isFinite(date.getTime()) ? date.toLocaleString("en-IN") : String(input.date || "");
  return `
<div class="top">
  <div>
    <div class="brand-name">${escapeHtml(shop.shopName || "Minarva Biz")}</div>
    ${legal}
    <div class="meta">${contacts}</div>
  </div>
  <div class="doc">
    <div class="doc-title">${escapeHtml(template.heading || input.fallbackTitle)}</div>
    <div class="doc-no">${escapeHtml(input.number)}</div>
    <div class="meta">${escapeHtml(formatted)}</div>
    ${input.extraMeta ? `<div class="meta">${escapeHtml(input.extraMeta)}</div>` : ""}
  </div>
</div>
${template.subheading ? `<div class="header-note">${escapeHtml(template.subheading)}</div>` : ""}`;
}

export function customerBlockHtml(template: PrintDocumentTemplate, customer?: Customer | null, fallbackName = "Walk-in"): string {
  if (!template.showCustomer) return "";
  const name = customer?.name || fallbackName;
  const details = [
    customer?.phone ? `<div>Phone: ${escapeHtml(customer.phone)}</div>` : "",
    customer?.email ? `<div>Email: ${escapeHtml(customer.email)}</div>` : "",
    customer?.address ? `<div>${escapeHtml(customer.address)}</div>` : "",
  ].filter(Boolean).join("");
  return `
<div class="party">
  <div class="party-box">
    <div class="party-label">Bill / Quote To</div>
    <div><strong>${escapeHtml(name)}</strong></div>
    <div class="meta">${details}</div>
  </div>
</div>`;
}

export function documentFooterHtml(template: PrintDocumentTemplate, notes?: string | null): string {
  return `
${template.showNotes && notes ? `<div class="note"><strong>Notes:</strong><br/>${escapeHtml(notes)}</div>` : ""}
${template.showTerms && template.termsText ? `<div class="terms"><strong>Terms & Conditions</strong><br/>${escapeHtml(template.termsText)}</div>` : ""}
${template.showSignature ? `<div class="sign"><div class="sign-box">Authorised Signatory</div></div>` : ""}
${template.footerText ? `<div class="footer">${escapeHtml(template.footerText)}</div>` : ""}`;
}

export function buildTemplateSampleHtml(template: PrintDocumentTemplate): string {
  const width = template.paper === "thermal" ? "80mm" : "210mm";
  const rows = [
    ["1", "Premium Cotton Kurti", "SKU-1001", "2", formatMoney(899), "5%", "5%", formatMoney(1708.1)],
    ["2", "Ladies Handbag", "SKU-2040", "1", formatMoney(1299), "0%", "5%", formatMoney(1363.95)],
  ];
  const itemRows = rows.map((row) => `<tr>
    <td class="c">${row[0]}</td><td>${row[1]}${template.showSku ? `<div class="meta">${row[2]}</div>` : ""}</td>
    <td class="r">${row[3]}</td><td class="r">${row[4]}</td>
    ${template.showTax ? `<td class="r">${row[6]}</td>` : ""}
    <td class="r">${row[7]}</td>
  </tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${documentCss(template, width)}</style></head><body><div class="sheet">
  ${businessHeaderHtml(template, { number: template.documentKind === "quotation" ? "QT-MT-2026-27-00001" : "INV-MT-2026-27-00001", date: new Date(), fallbackTitle: template.documentKind === "quotation" ? "QUOTATION" : "TAX INVOICE", extraMeta: template.documentKind === "quotation" ? "Valid for 15 days" : undefined })}
  ${customerBlockHtml(template, { id:"sample", name:"Sample Customer", phone:"+91 98765 43210", email:"customer@example.com", address:"Thiruvananthapuram, Kerala", outstandingBalance:0,totalSpending:0,createdAt:"",updatedAt:"" } as Customer)}
  <table><thead><tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th>${template.showTax ? '<th class="r">Tax</th>' : ''}<th class="r">Amount</th></tr></thead><tbody>${itemRows}</tbody></table>
  <table class="totals"><tr><td>Subtotal</td><td class="r">${formatMoney(2997)}</td></tr><tr><td>Discount</td><td class="r">${formatMoney(90)}</td></tr>${template.showTax ? `<tr><td>Tax</td><td class="r">${formatMoney(165.05)}</td></tr>` : ""}<tr class="grand"><td>Total</td><td class="r">${formatMoney(3072.05)}</td></tr>${template.showPaymentSummary ? `<tr><td>Paid / Advance</td><td class="r">${formatMoney(1000)}</td></tr><tr><td>Balance</td><td class="r">${formatMoney(2072.05)}</td></tr>` : ""}</table>
  ${documentFooterHtml(template, "This is a sample preview.")}
  </div></body></html>`;
}
