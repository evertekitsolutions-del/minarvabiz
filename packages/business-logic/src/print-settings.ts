/**
 * Printer and invoice-output preferences shared by web/desktop.
 * Desktop can use named Windows printers through the Electron bridge;
 * web falls back to the browser print dialog.
 */
import { nowISO } from "@minarvabiz/utils";
import { touchPersistence } from "./autosave";
import { defaultPrintTemplates, normalizePrintTemplates, sanitizePrintTemplate, type PrintDocumentKind, type PrintDocumentTemplate, type PrintPaper } from "./print-templates";

export interface PrintSettings {
  defaultInvoicePaper: "a4" | "thermal";
  thermalWidthMm: 58 | 80;
  a4PrinterName: string;
  thermalPrinterName: string;
  labelPrinterName: string;
  labelWidthMm: number;
  labelHeightMm: number;
  labelCodeMode: "barcode" | "qr" | "both";
  silentDesktopPrint: boolean;
  templates: PrintDocumentTemplate[];
  updatedAt: string;
}

const defaults: PrintSettings = {
  defaultInvoicePaper: "a4",
  thermalWidthMm: 80,
  a4PrinterName: "",
  thermalPrinterName: "",
  labelPrinterName: "",
  labelWidthMm: 50,
  labelHeightMm: 30,
  labelCodeMode: "both",
  silentDesktopPrint: false,
  templates: defaultPrintTemplates(),
  updatedAt: nowISO(),
};

let settings: PrintSettings = { ...defaults };

export function getPrintSettings(): PrintSettings {
  return { ...settings };
}

export function updatePrintSettings(patch: Partial<PrintSettings>): PrintSettings {
  const width = patch.thermalWidthMm === 58 ? 58 : patch.thermalWidthMm === 80 ? 80 : settings.thermalWidthMm;
  const labelWidthMm = Number.isFinite(Number(patch.labelWidthMm))
    ? Math.max(20, Math.min(120, Number(patch.labelWidthMm)))
    : settings.labelWidthMm;
  const labelHeightMm = Number.isFinite(Number(patch.labelHeightMm))
    ? Math.max(15, Math.min(150, Number(patch.labelHeightMm)))
    : settings.labelHeightMm;
  settings = {
    ...settings,
    ...patch,
    thermalWidthMm: width,
    labelWidthMm,
    labelHeightMm,
    labelCodeMode: patch.labelCodeMode === "barcode" || patch.labelCodeMode === "qr" || patch.labelCodeMode === "both" ? patch.labelCodeMode : settings.labelCodeMode,
    templates: patch.templates ? normalizePrintTemplates(patch.templates) : settings.templates,
    updatedAt: nowISO(),
  };
  touchPersistence();
  return getPrintSettings();
}

export function hydratePrintSettings(value: Partial<PrintSettings> | null | undefined) {
  if (!value) return;
  settings = {
    ...defaults,
    ...value,
    thermalWidthMm: value.thermalWidthMm === 58 ? 58 : 80,
    labelPrinterName: value.labelPrinterName || "",
    labelWidthMm: Number.isFinite(Number(value.labelWidthMm)) ? Math.max(20, Math.min(120, Number(value.labelWidthMm))) : defaults.labelWidthMm,
    labelHeightMm: Number.isFinite(Number(value.labelHeightMm)) ? Math.max(15, Math.min(150, Number(value.labelHeightMm))) : defaults.labelHeightMm,
    labelCodeMode: value.labelCodeMode === "barcode" || value.labelCodeMode === "qr" || value.labelCodeMode === "both" ? value.labelCodeMode : defaults.labelCodeMode,
    templates: normalizePrintTemplates(value.templates),
    updatedAt: value.updatedAt || nowISO(),
  };
}


export function listPrintTemplates(): PrintDocumentTemplate[] {
  return settings.templates.map((template) => ({ ...template }));
}

export function getPrintTemplate(documentKind: PrintDocumentKind, paper: PrintPaper): PrintDocumentTemplate {
  const group = settings.templates.filter((template) => template.documentKind === documentKind && template.paper === paper);
  return { ...(group.find((template) => template.isDefault) ?? group[0] ?? defaultPrintTemplates().find((template) => template.documentKind === documentKind && template.paper === paper)!) };
}

export function getPrintTemplateById(id: string): PrintDocumentTemplate | null {
  const found = settings.templates.find((template) => template.id === id);
  return found ? { ...found } : null;
}

export function savePrintTemplate(template: PrintDocumentTemplate): PrintDocumentTemplate {
  const clean = sanitizePrintTemplate(template);
  const templates = settings.templates.map((item) => ({ ...item }));
  const index = templates.findIndex((item) => item.id === clean.id);
  if (clean.isDefault) {
    for (const item of templates) {
      if (item.documentKind === clean.documentKind && item.paper === clean.paper) item.isDefault = false;
    }
  }
  if (index >= 0) templates[index] = clean;
  else templates.push(clean);
  if (!templates.some((item) => item.documentKind === clean.documentKind && item.paper === clean.paper && item.isDefault)) {
    const first = templates.find((item) => item.documentKind === clean.documentKind && item.paper === clean.paper);
    if (first) first.isDefault = true;
  }
  updatePrintSettings({ templates });
  return { ...clean };
}

export function duplicatePrintTemplate(id: string): PrintDocumentTemplate | null {
  const source = settings.templates.find((item) => item.id === id);
  if (!source) return null;
  const copy = sanitizePrintTemplate({
    ...source,
    id: `custom-${Date.now()}`,
    name: `${source.name} Copy`,
    isSystem: false,
    isDefault: false,
  });
  updatePrintSettings({ templates: [...settings.templates, copy] });
  return { ...copy };
}

export function deletePrintTemplate(id: string): { ok: boolean; error?: string } {
  const source = settings.templates.find((item) => item.id === id);
  if (!source) return { ok: false, error: "Template not found." };
  const group = settings.templates.filter((item) => item.documentKind === source.documentKind && item.paper === source.paper);
  if (group.length <= 1) return { ok: false, error: "At least one template must remain for this document and paper type." };
  const next = settings.templates.filter((item) => item.id !== id).map((item) => ({ ...item }));
  if (source.isDefault) {
    const replacement = next.find((item) => item.documentKind === source.documentKind && item.paper === source.paper);
    if (replacement) replacement.isDefault = true;
  }
  updatePrintSettings({ templates: next });
  return { ok: true };
}

export function resetPrintTemplates(): PrintDocumentTemplate[] {
  updatePrintSettings({ templates: defaultPrintTemplates() });
  return listPrintTemplates();
}
