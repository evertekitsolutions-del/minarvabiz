"use client";

import * as React from "react";
import {
  buildTemplateSampleHtml,
  deletePrintTemplate,
  duplicatePrintTemplate,
  listPrintTemplates,
  resetPrintTemplates,
  savePrintTemplate,
  type PrintDocumentTemplate,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { Modal } from "../forms/Modal";
import { FormField, inputClass, selectClass } from "../forms/FormField";
import { PrintPreviewModal } from "../printing/PrintPreviewModal";

const TOGGLES: Array<{ key: keyof PrintDocumentTemplate; label: string }> = [
  { key: "showLegalName", label: "Registered legal name" },
  { key: "showAddress", label: "Business address" },
  { key: "showPhone", label: "Phone" },
  { key: "showEmail", label: "Email" },
  { key: "showWebsite", label: "Website" },
  { key: "showGstin", label: "GSTIN / tax number" },
  { key: "showCustomer", label: "Customer details" },
  { key: "showSku", label: "SKU / product reference" },
  { key: "showTax", label: "Tax details" },
  { key: "showPaymentSummary", label: "Paid / advance / balance" },
  { key: "showNotes", label: "Document notes" },
  { key: "showTerms", label: "Terms & conditions" },
  { key: "showSignature", label: "Authorised signature" },
];

function clone(template: PrintDocumentTemplate): PrintDocumentTemplate {
  return { ...template };
}

export function PrintTemplateManager() {
  const [templates, setTemplates] = React.useState(() => listPrintTemplates());
  const [selectedId, setSelectedId] = React.useState(() => templates[0]?.id || "");
  const [draft, setDraft] = React.useState<PrintDocumentTemplate | null>(() => templates[0] ? clone(templates[0]) : null);
  const [message, setMessage] = React.useState("");
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [pending, setPending] = React.useState<"save" | "delete" | "reset" | null>(null);
  const [confirmation, setConfirmation] = React.useState("");

  function refresh(selectId?: string) {
    const next = listPrintTemplates();
    setTemplates(next);
    const id = selectId || selectedId || next[0]?.id || "";
    const selected = next.find((item) => item.id === id) || next[0] || null;
    setSelectedId(selected?.id || "");
    setDraft(selected ? clone(selected) : null);
  }

  function select(id: string) {
    const selected = templates.find((item) => item.id === id);
    setSelectedId(id);
    setDraft(selected ? clone(selected) : null);
    setMessage("");
  }

  function save() {
    if (!draft) return;

    const saved = savePrintTemplate(draft);
    refresh(saved.id);
    setMessage("Template saved.");
  }

  function duplicate() {
    if (!draft) return;
    const copy = duplicatePrintTemplate(draft.id);
    if (!copy) return;
    refresh(copy.id);
    setMessage("Template duplicated. Edit the copy and save.");
  }

  function remove() {
    if (!draft) return;

    const result = deletePrintTemplate(draft.id);
    if (!result.ok) {
      setMessage(result.error || "Unable to delete template.");
      return;
    }
    setSelectedId("");
    refresh();
    setMessage("Template deleted.");
  }

  function reset() {

    resetPrintTemplates();
    setSelectedId("");
    refresh();
    setMessage("Professional default templates restored.");
  }

  const previewHtml = draft ? buildTemplateSampleHtml(draft) : "";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Invoice & quotation templates</h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Edit A4 and thermal layouts without editing raw HTML. These templates are shared by Online, Offline and Hybrid editions and are included in backups.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => { setConfirmation(""); setPending("reset"); }}>Restore professional defaults</Button>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => select(template.id)}
              className={`w-full rounded-xl border px-3 py-3 text-left transition ${selectedId === template.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">{template.name}</span>
                {template.isDefault && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">DEFAULT</span>}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {template.documentKind === "invoice" ? "Invoice" : "Quotation"} · {template.paper === "a4" ? "A4" : "Thermal"} · {template.layout}
              </div>
            </button>
          ))}
        </div>

        {draft && (
          <div className="space-y-5 rounded-xl border border-slate-200 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Template name"><input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></FormField>
              <FormField label="Document type"><select className={selectClass} value={draft.documentKind} onChange={(e) => setDraft({ ...draft, documentKind: e.target.value === "quotation" ? "quotation" : "invoice" })}><option value="invoice">Invoice / Service invoice</option><option value="quotation">Quotation</option></select></FormField>
              <FormField label="Paper"><select className={selectClass} value={draft.paper} onChange={(e) => setDraft({ ...draft, paper: e.target.value === "thermal" ? "thermal" : "a4" })}><option value="a4">A4</option><option value="thermal">Thermal</option></select></FormField>
              <FormField label="Design"><select className={selectClass} value={draft.layout} onChange={(e) => setDraft({ ...draft, layout: e.target.value as PrintDocumentTemplate["layout"] })}><option value="modern">Modern professional</option><option value="classic">Classic</option><option value="compact">Compact</option></select></FormField>
              <FormField label="Document heading"><input className={inputClass} value={draft.heading} onChange={(e) => setDraft({ ...draft, heading: e.target.value })} /></FormField>
              <FormField label="Accent colour"><input className={inputClass} type="color" value={draft.accentColor} onChange={(e) => setDraft({ ...draft, accentColor: e.target.value })} /></FormField>
              <FormField label="Font scale"><input className={inputClass} type="number" min="0.8" max="1.35" step="0.05" value={draft.fontScale} onChange={(e) => setDraft({ ...draft, fontScale: Number(e.target.value) || 1 })} /></FormField>
              <FormField label="Default for this document/paper"><select className={selectClass} value={draft.isDefault ? "yes" : "no"} onChange={(e) => setDraft({ ...draft, isDefault: e.target.value === "yes" })}><option value="yes">Yes</option><option value="no">No</option></select></FormField>
              <FormField label="Header / subheading" className="md:col-span-2"><input className={inputClass} value={draft.subheading} onChange={(e) => setDraft({ ...draft, subheading: e.target.value })} placeholder="Optional registration note, branch name or tagline" /></FormField>
              <FormField label="Signature label"><input className={inputClass} value={draft.signatureLabel} onChange={(e) => setDraft({ ...draft, signatureLabel: e.target.value })} placeholder="Authorised Signatory" /></FormField>
              <FormField label="Footer text" className="md:col-span-2"><textarea className={inputClass + " h-20 py-2"} value={draft.footerText} onChange={(e) => setDraft({ ...draft, footerText: e.target.value })} /></FormField>
              <FormField label="Terms & conditions" className="md:col-span-2"><textarea className={inputClass + " h-28 py-2"} value={draft.termsText} onChange={(e) => setDraft({ ...draft, termsText: e.target.value })} /></FormField>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-800">Content shown on the document</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {TOGGLES.map(({ key, label }) => (
                  <label key={String(key)} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(draft[key])}
                      onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {message && <p className="text-sm text-slate-600">{message}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>Preview</Button>
              <Button type="button" variant="outline" onClick={duplicate}>Duplicate</Button>
              <Button type="button" variant="outline" onClick={() => { setConfirmation(""); setPending("delete"); }}>Delete</Button>
              <Button type="button" onClick={() => setPending("save")}>Save template</Button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={pending !== null}
        title="Confirm template change"
        onClose={() => setPending(null)}
        footer={<>
          <Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
          <Button
            variant={pending === "save" ? "primary" : "danger"}
            disabled={pending !== "save" && confirmation !== pending?.toUpperCase()}
            onClick={() => {
              if (pending === "save") save();
              else if (pending === "delete" && confirmation === "DELETE") remove();
              else if (pending === "reset" && confirmation === "RESET") reset();
              setPending(null);
            }}
          >Confirm {pending}</Button>
        </>}
      >
        <p className="mb-4 text-sm text-slate-600">
          {pending === "save" ? `Save changes to “${draft?.name}”? Future documents will use these settings.`
            : pending === "delete" ? `Permanently delete “${draft?.name}”? This cannot be undone.`
            : "Restore professional defaults? All custom template edits will be replaced."}
        </p>
        {pending && pending !== "save" && <FormField label={`Type ${pending.toUpperCase()} to confirm`}>
          <input autoFocus className={inputClass} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </FormField>}
      </Modal>

      {draft && (
        <PrintPreviewModal
          open={previewOpen}
          title={`${draft.name} — Preview`}
          html={previewHtml}
          paper={draft.paper}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </section>
  );
}
