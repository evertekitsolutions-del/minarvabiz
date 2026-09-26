"use client";

import * as React from "react";
import type { Quotation, Sale } from "@minarvabiz/types";
import {
  buildQuotationHtml,
  buildSaleInvoiceHtml,
  createPrintTemplate,
  deletePrintTemplate,
  getPrintTemplate,
  listPrintTemplates,
  printPreparedHtml,
  resetPrintTemplate,
  updatePrintTemplate,
  type PrintDocumentType,
  type PrintPaper,
  type PrintTemplate,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { FormField, inputClass, selectClass } from "../forms/FormField";
import { PrintPreviewModal } from "../printing/PrintPreviewModal";

type PrintingTemplateSelection = {
  invoiceA4TemplateId: string;
  invoiceThermalTemplateId: string;
  quotationA4TemplateId: string;
  quotationThermalTemplateId: string;
};

function activeKey(documentType: PrintDocumentType, paper: PrintPaper): keyof PrintingTemplateSelection {
  if (documentType === "invoice") return paper === "a4" ? "invoiceA4TemplateId" : "invoiceThermalTemplateId";
  return paper === "a4" ? "quotationA4TemplateId" : "quotationThermalTemplateId";
}

const sampleSale: Sale = {
  id: "preview-sale",
  invoiceNumber: "INV-DEMO-2026-27-00001",
  customerId: null,
  customerName: "Sample Customer",
  saleDate: new Date().toISOString(),
  subtotal: 2500,
  discountAmount: 100,
  taxAmount: 120,
  total: 2520,
  paidAmount: 2000,
  balanceAmount: 520,
  status: "partial",
  notes: "Thank you. Please verify quantities before leaving.",
  items: [
    { id: "i1", saleId: "preview-sale", productId: "p1", productName: "Premium Cotton Kurti", sku: "KUR-001", quantity: 2, unitPrice: 900, costPrice: 500, discountPercent: 5, taxRate: 5, lineTotal: 1795.5 },
    { id: "i2", saleId: "preview-sale", productId: "p2", productName: "Designer Ornament", sku: "ORN-014", quantity: 1, unitPrice: 700, costPrice: 350, discountPercent: 0, taxRate: 5, lineTotal: 724.5 },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  version: 1,
};

const sampleQuotation = {
  id: "preview-quotation",
  quotationNumber: "QT-DEMO-2026-27-00001",
  customerId: "preview-customer",
  customerName: "Sample Customer",
  status: "sent",
  lines: [
    { id: "q1", kind: "service", productId: null, description: "Custom Wedding Dress", quantity: 1, unitPrice: 8500, lineTotal: 8500 },
    { id: "q2", kind: "service", productId: null, description: "Embroidery & Finishing", quantity: 1, unitPrice: 1500, lineTotal: 1500 },
  ],
  materialCharges: 2000,
  labourCharges: 1500,
  subtotal: 13500,
  discount: 500,
  tax: 650,
  total: 13650,
  advance: 3000,
  balance: 10650,
  validUntil: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  notes: "Final measurements must be confirmed before cutting.",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  version: 1,
} as Quotation;

const toggleFields: Array<[keyof PrintTemplate, string]> = [
  ["showLegalName", "Registered legal name"],
  ["showAddress", "Business address"],
  ["showPhone", "Phone"],
  ["showEmail", "Email"],
  ["showWebsite", "Website"],
  ["showGstin", "GSTIN"],
  ["showCustomerAddress", "Customer address"],
  ["showSku", "SKU column"],
  ["showDiscount", "Discount"],
  ["showTax", "Tax"],
  ["showPaymentSummary", "Paid / balance"],
  ["showNotes", "Notes"],
  ["showTerms", "Terms"],
  ["showAuthorizedSignatory", "Authorized signatory"],
];

export function PrintTemplateManager({
  selection,
  onSelectionChange,
}: {
  selection: PrintingTemplateSelection;
  onSelectionChange: (patch: Partial<PrintingTemplateSelection>) => void;
}) {
  const [documentType, setDocumentType] = React.useState<PrintDocumentType>("invoice");
  const [paper, setPaper] = React.useState<PrintPaper>("a4");
  const [templates, setTemplates] = React.useState(() => listPrintTemplates("invoice", "a4"));
  const [selectedId, setSelectedId] = React.useState(selection.invoiceA4TemplateId);
  const [draft, setDraft] = React.useState<PrintTemplate>(() => getPrintTemplate("invoice", "a4", selection.invoiceA4TemplateId));
  const [newName, setNewName] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [preview, setPreview] = React.useState<{ html: string; title: string } | null>(null);

  function reload(nextDocument = documentType, nextPaper = paper, preferredId?: string) {
    const list = listPrintTemplates(nextDocument, nextPaper);
    const key = activeKey(nextDocument, nextPaper);
    const requested = preferredId || selection[key];
    const chosen = list.find((item) => item.id === requested) || list[0] || getPrintTemplate(nextDocument, nextPaper);
    setTemplates(listPrintTemplates(nextDocument, nextPaper));
    setSelectedId(chosen.id);
    setDraft(chosen);
  }

  function switchKind(nextDocument: PrintDocumentType, nextPaper: PrintPaper) {
    setDocumentType(nextDocument);
    setPaper(nextPaper);
    setMessage("");
    reload(nextDocument, nextPaper);
  }

  function selectTemplate(id: string) {
    const selected = getPrintTemplate(documentType, paper, id);
    setSelectedId(selected.id);
    setDraft(selected);
  }

  function makeActive() {
    const key = activeKey(documentType, paper);
    onSelectionChange({ [key]: selectedId } as Partial<PrintingTemplateSelection>);
    setMessage(`${draft.name} is now the active ${documentType} ${paper.toUpperCase()} template.`);
  }

  function save() {
    if (!window.confirm(`Save edits to “${draft.name}”? These changes affect future ${documentType} prints.`)) return;
    const updated = updatePrintTemplate(draft.id, draft);
    if (!updated) { setMessage("Unable to save template."); return; }
    setDraft(updated);
    reload(documentType, paper, updated.id);
    setMessage("Template changes saved.");
  }

  function duplicate() {
    const name = newName.trim() || `${draft.name} Copy`;
    const created = createPrintTemplate({ documentType, paper, name, sourceTemplateId: draft.id });
    setNewName("");
    reload(documentType, paper, created.id);
    setMessage("Custom template created.");
  }

  function remove() {
    if (!window.confirm(`Delete “${draft.name}”? This action cannot be undone. If it is the last template for this format, Minarva Biz will restore the professional default.`)) return;
    const result = deletePrintTemplate(draft.id);
    if (!result.deleted) { setMessage("Template was not deleted."); return; }
    const key = activeKey(documentType, paper);
    const replacement = result.replacement || getPrintTemplate(documentType, paper);
    if (selection[key] === draft.id) onSelectionChange({ [key]: replacement.id } as Partial<PrintingTemplateSelection>);
    reload(documentType, paper, replacement.id);
    setMessage("Template deleted.");
  }

  function reset() {
    if (!window.confirm(`Reset “${draft.name}” to the professional Minarva Biz defaults? Custom edits will be replaced.`)) return;
    const updated = resetPrintTemplate(draft.id);
    if (!updated) return;
    setDraft(updated);
    reload(documentType, paper, updated.id);
    setMessage("Template reset to professional defaults.");
  }

  function previewSaved() {
    const updated = updatePrintTemplate(draft.id, draft);
    if (!updated) return;
    const html = documentType === "invoice"
      ? buildSaleInvoiceHtml(sampleSale, { paper, templateId: updated.id, autoPrint: false })
      : buildQuotationHtml(sampleQuotation, { paper, templateId: updated.id, autoPrint: false });
    setDraft(updated);
    setPreview({ html, title: `${updated.name} Preview` });
  }

  const currentKey = activeKey(documentType, paper);
  const isActive = selection[currentKey] === selectedId;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <PrintPreviewModal
        open={Boolean(preview)}
        title={preview?.title || "Template Preview"}
        html={preview?.html || ""}
        paper={paper}
        onClose={() => setPreview(null)}
        onPrint={() => { if (preview) printPreparedHtml(preview.html, paper); }}
      />
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Invoice & quotation templates</h3>
        <p className="mt-1 text-sm text-slate-500">
          Customize professional A4 and thermal layouts. Choose content, labels, terms, typography and visibility without editing source code.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(["invoice", "quotation"] as PrintDocumentType[]).flatMap((doc) =>
          (["a4", "thermal"] as PrintPaper[]).map((p) => (
            <Button key={`${doc}-${p}`} type="button" variant={documentType === doc && paper === p ? "primary" : "outline"} onClick={() => switchKind(doc, p)}>
              {doc === "invoice" ? "Invoice" : "Quotation"} · {p === "a4" ? "A4" : "Thermal"}
            </Button>
          ))
        )}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <FormField label="Template">
            <select className={selectClass} value={selectedId} onChange={(e) => selectTemplate(e.target.value)}>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={makeActive} disabled={isActive}>{isActive ? "Active" : "Make Active"}</Button>
            <Button type="button" size="sm" variant="outline" onClick={previewSaved}>Preview</Button>
          </div>
          <div className="border-t border-slate-200 pt-3">
            <FormField label="New / duplicate template name">
              <input className={inputClass} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My Boutique Template" />
            </FormField>
            <Button type="button" className="mt-2" size="sm" variant="outline" onClick={duplicate}>Duplicate as New</Button>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
            <Button type="button" size="sm" variant="outline" onClick={reset}>Reset</Button>
            <Button type="button" size="sm" variant="outline" onClick={remove}>Delete</Button>
          </div>
          {message && <p className="text-xs text-slate-600">{message}</p>}
        </div>

        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Template name"><input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></FormField>
            <FormField label="Document title"><input className={inputClass} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></FormField>
            <FormField label="Accent color"><input className={inputClass} type="color" value={draft.accentColor} onChange={(e) => setDraft({ ...draft, accentColor: e.target.value })} /></FormField>
            <FormField label="Font"><select className={selectClass} value={draft.fontFamily} onChange={(e) => setDraft({ ...draft, fontFamily: e.target.value as PrintTemplate["fontFamily"] })}><option value="system">Modern / System</option><option value="serif">Classic / Serif</option><option value="mono">Mono</option></select></FormField>
            <FormField label="Density"><select className={selectClass} value={draft.density} onChange={(e) => setDraft({ ...draft, density: e.target.value as PrintTemplate["density"] })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></FormField>
          </div>

          <div className="grid gap-4">
            <FormField label="Header text"><textarea className={inputClass + " h-auto py-2"} rows={2} value={draft.headerText} onChange={(e) => setDraft({ ...draft, headerText: e.target.value })} /></FormField>
            <FormField label="Terms & conditions"><textarea className={inputClass + " h-auto py-2"} rows={3} value={draft.termsText} onChange={(e) => setDraft({ ...draft, termsText: e.target.value })} /></FormField>
            <FormField label="Footer text"><textarea className={inputClass + " h-auto py-2"} rows={2} value={draft.footerText} onChange={(e) => setDraft({ ...draft, footerText: e.target.value })} /></FormField>
          </div>

          <div>
            <div className="text-sm font-semibold text-slate-800">Visible content</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {toggleFields.map(([key, label]) => (
                <label key={String(key)} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <input type="checkbox" checked={Boolean(draft[key])} onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-slate-800">Field labels</div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(draft.labels).map(([key, value]) => (
                <FormField key={key} label={key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}>
                  <input className={inputClass} value={value} onChange={(e) => setDraft({ ...draft, labels: { ...draft.labels, [key]: e.target.value } })} />
                </FormField>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={previewSaved}>Preview Changes</Button>
            <Button type="button" onClick={save}>Save Template</Button>
          </div>
        </div>
      </div>
    </section>
  );
}
