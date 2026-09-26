"use client";

import * as React from "react";
import { Button } from "../Button";
import { FormField, inputClass, selectClass } from "../forms/FormField";

export type EditablePrintTemplate = {
  id: string;
  name: string;
  documentKind: "invoice" | "quotation";
  paper: "a4" | "thermal";
  layout: "modern" | "classic" | "compact";
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
};

const VISIBILITY_FIELDS: Array<{ key: keyof EditablePrintTemplate; label: string }> = [
  { key: "showLegalName", label: "Registered legal name" },
  { key: "showAddress", label: "Full address" },
  { key: "showPhone", label: "Phone" },
  { key: "showEmail", label: "Email" },
  { key: "showWebsite", label: "Website" },
  { key: "showGstin", label: "GSTIN" },
  { key: "showCustomer", label: "Customer details" },
  { key: "showSku", label: "SKU" },
  { key: "showTax", label: "GST / tax details" },
  { key: "showPaymentSummary", label: "Paid / balance summary" },
  { key: "showNotes", label: "Notes" },
  { key: "showTerms", label: "Terms & conditions" },
  { key: "showSignature", label: "Authorised signature" },
];

export function PrintTemplateEditor({
  templates,
  onSaveTemplates,
}: {
  templates: EditablePrintTemplate[];
  onSaveTemplates: (templates: EditablePrintTemplate[]) => void;
}) {
  const [selectedId, setSelectedId] = React.useState(templates[0]?.id || "");
  const selected = templates.find((item) => item.id === selectedId) ?? templates[0] ?? null;
  const [draft, setDraft] = React.useState<EditablePrintTemplate | null>(selected ? { ...selected } : null);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    const current = templates.find((item) => item.id === selectedId) ?? templates[0] ?? null;
    if (!current) return;
    if (current.id !== selectedId) setSelectedId(current.id);
    setDraft({ ...current });
  }, [templates, selectedId]);

  if (!draft) return null;

  function save() {
    if (!window.confirm(`Save changes to "${draft.name}"? This will change future printed documents using this template.`)) return;
    const next = templates.map((item) => ({ ...item }));
    const index = next.findIndex((item) => item.id === draft.id);
    const clean = { ...draft, name: draft.name.trim() || "Document template" };
    if (clean.isDefault) {
      for (const item of next) {
        if (item.documentKind === clean.documentKind && item.paper === clean.paper) item.isDefault = false;
      }
    }
    if (index >= 0) next[index] = clean;
    else next.push(clean);
    if (!next.some((item) => item.documentKind === clean.documentKind && item.paper === clean.paper && item.isDefault)) clean.isDefault = true;
    onSaveTemplates(next);
    setMessage("Template saved.");
  }

  function duplicate() {
    const copy: EditablePrintTemplate = {
      ...draft,
      id: `custom-${Date.now()}`,
      name: `${draft.name} Copy`,
      isSystem: false,
      isDefault: false,
    };
    const next = [...templates.map((item) => ({ ...item })), copy];
    onSaveTemplates(next);
    setSelectedId(copy.id);
    setDraft(copy);
    setMessage("Template duplicated. Edit the copy and save when ready.");
  }

  function remove() {
    const group = templates.filter((item) => item.documentKind === draft.documentKind && item.paper === draft.paper);
    if (group.length <= 1) {
      setMessage("At least one template must remain for this document and paper type. Duplicate another template before deleting this one.");
      return;
    }
    if (!window.confirm(`Delete "${draft.name}"? This cannot be undone. Existing invoices remain unchanged, but future prints will use another template.`)) return;
    const next = templates.filter((item) => item.id !== draft.id).map((item) => ({ ...item }));
    if (draft.isDefault) {
      const replacement = next.find((item) => item.documentKind === draft.documentKind && item.paper === draft.paper);
      if (replacement) replacement.isDefault = true;
    }
    onSaveTemplates(next);
    setSelectedId(next[0]?.id || "");
    setMessage("Template deleted.");
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Invoice & quotation templates</h3>
        <p className="mt-1 text-sm text-slate-500">
          Edit the professional A4 and thermal layouts. Changes affect future print/preview output across Online, Offline and Hybrid editions.
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FormField label="Template">
          <select className={selectClass} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {templates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.documentKind} · {item.paper.toUpperCase()}{item.isDefault ? " · Default" : ""}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Template name">
          <input className={inputClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </FormField>
        <FormField label="Document type">
          <select className={selectClass} value={draft.documentKind} onChange={(event) => setDraft({ ...draft, documentKind: event.target.value as "invoice" | "quotation" })}>
            <option value="invoice">Invoice</option>
            <option value="quotation">Quotation</option>
          </select>
        </FormField>
        <FormField label="Paper">
          <select className={selectClass} value={draft.paper} onChange={(event) => setDraft({ ...draft, paper: event.target.value as "a4" | "thermal" })}>
            <option value="a4">A4</option>
            <option value="thermal">Thermal</option>
          </select>
        </FormField>
        <FormField label="Layout">
          <select className={selectClass} value={draft.layout} onChange={(event) => setDraft({ ...draft, layout: event.target.value as "modern" | "classic" | "compact" })}>
            <option value="modern">Modern professional</option>
            <option value="classic">Classic bordered</option>
            <option value="compact">Compact</option>
          </select>
        </FormField>
        <FormField label="Default for this type / paper">
          <select className={selectClass} value={draft.isDefault ? "yes" : "no"} onChange={(event) => setDraft({ ...draft, isDefault: event.target.value === "yes" })}>
            <option value="yes">Use as default</option>
            <option value="no">Alternative template</option>
          </select>
        </FormField>
        <FormField label="Heading">
          <input className={inputClass} value={draft.heading} onChange={(event) => setDraft({ ...draft, heading: event.target.value })} />
        </FormField>
        <FormField label="Subheading">
          <input className={inputClass} value={draft.subheading} onChange={(event) => setDraft({ ...draft, subheading: event.target.value })} />
        </FormField>
        <FormField label="Accent colour">
          <input className={inputClass} type="color" value={draft.accentColor} onChange={(event) => setDraft({ ...draft, accentColor: event.target.value })} />
        </FormField>
        <FormField label="Font scale">
          <input className={inputClass} type="number" min="0.8" max="1.35" step="0.05" value={draft.fontScale} onChange={(event) => setDraft({ ...draft, fontScale: Math.max(0.8, Math.min(1.35, Number(event.target.value) || 1)) })} />
        </FormField>
        <FormField label="Footer text" className="md:col-span-2">
          <textarea className={inputClass + " h-auto py-2"} rows={2} value={draft.footerText} onChange={(event) => setDraft({ ...draft, footerText: event.target.value })} />
        </FormField>
        <FormField label="Terms & conditions" className="md:col-span-2">
          <textarea className={inputClass + " h-auto py-2"} rows={4} value={draft.termsText} onChange={(event) => setDraft({ ...draft, termsText: event.target.value })} />
        </FormField>
      </div>

      <div className="mt-5">
        <div className="text-sm font-medium text-slate-800">Visible content</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {VISIBILITY_FIELDS.map((item) => (
            <label key={String(item.key)} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(draft[item.key])}
                onChange={(event) => setDraft({ ...draft, [item.key]: event.target.checked })}
              />
              {item.label}
            </label>
          ))}
        </div>
      </div>

      {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={duplicate}>Duplicate</Button>
        <Button type="button" variant="outline" onClick={remove}>Delete</Button>
        <Button type="button" onClick={save}>Save template</Button>
      </div>
    </section>
  );
}
