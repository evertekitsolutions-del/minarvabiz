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
  labelLayout: "compact" | "detailed";
  labelColumns: 1 | 2;
  labelRollWidthMm: number;
  labelGapMm: number;
  labelLeftMarginMm: number;
  labelRowGapMm: number;
  silentDesktopPrint: boolean;
  templates: PrintDocumentTemplate[];
  updatedAt: string;
}

/** CROMO 38×25 mm / two across / no inter-label or feed gap.
 * 76 mm is sticker span; 80 mm liner and 2 mm side margin are CALIBRATION
 * STARTING VALUES, not manufacturer-confirmed backing dimensions.
 * Never apply globally: shops with different rolls keep existing settings. */
export const CROMO_38X25_2UP_NOGAP_PRESET = {
  labelWidthMm: 38,
  labelHeightMm: 25,
  labelColumns: 2,
  labelRollWidthMm: 80,
  labelGapMm: 0,
  labelLeftMarginMm: 2,
  labelRowGapMm: 0,
  labelCodeMode: "both",
  labelLayout: "compact",
} as const satisfies Partial<PrintSettings>;

const defaults: PrintSettings = {
  defaultInvoicePaper: "a4",
  thermalWidthMm: 80,
  a4PrinterName: "",
  thermalPrinterName: "",
  labelPrinterName: "",
  labelWidthMm: 50,
  labelHeightMm: 30,
  labelCodeMode: "both",
  labelLayout: "compact",
  labelColumns: 1,
  labelRollWidthMm: 101.6,
  labelGapMm: 3,
  labelLeftMarginMm: 11.3,
  labelRowGapMm: 0,
  silentDesktopPrint: false,
  templates: defaultPrintTemplates(),
  updatedAt: nowISO(),
};

let settings: PrintSettings = { ...defaults };

export function getPrintSettings(): PrintSettings {
  return { ...settings, templates: settings.templates.map((template) => ({ ...template })) };
}

export function updatePrintSettings(patch: Partial<PrintSettings>): PrintSettings {
  const width = patch.thermalWidthMm === 58 ? 58 : patch.thermalWidthMm === 80 ? 80 : settings.thermalWidthMm;
  const labelWidthMm = Number.isFinite(Number(patch.labelWidthMm))
    ? Math.max(20, Math.min(120, Number(patch.labelWidthMm)))
    : settings.labelWidthMm;
  const labelHeightMm = Number.isFinite(Number(patch.labelHeightMm))
    ? Math.max(15, Math.min(150, Number(patch.labelHeightMm)))
    : settings.labelHeightMm;
  const next: PrintSettings = {
    ...settings,
    ...patch,
    thermalWidthMm: width,
    labelWidthMm,
    labelHeightMm,
    labelCodeMode: patch.labelCodeMode === "barcode" || patch.labelCodeMode === "qr" || patch.labelCodeMode === "both" ? patch.labelCodeMode : settings.labelCodeMode,
    labelLayout: patch.labelLayout === "compact" || patch.labelLayout === "detailed" ? patch.labelLayout : settings.labelLayout,
    labelColumns: patch.labelColumns === 2 ? 2 : patch.labelColumns === 1 ? 1 : settings.labelColumns,
    labelRollWidthMm: Number.isFinite(Number(patch.labelRollWidthMm)) ? Math.max(40, Math.min(120, Number(patch.labelRollWidthMm))) : settings.labelRollWidthMm,
    labelGapMm: Number.isFinite(Number(patch.labelGapMm)) ? Math.max(0, Math.min(30, Number(patch.labelGapMm))) : settings.labelGapMm,
    labelLeftMarginMm: Number.isFinite(Number(patch.labelLeftMarginMm)) ? Math.max(0, Math.min(50, Number(patch.labelLeftMarginMm))) : settings.labelLeftMarginMm,
    labelRowGapMm: Number.isFinite(Number(patch.labelRowGapMm)) ? Math.max(0, Math.min(20, Number(patch.labelRowGapMm))) : settings.labelRowGapMm,
    templates: patch.templates ? normalizePrintTemplates(patch.templates) : settings.templates,
    updatedAt: nowISO(),
  };
  // Repeatedly clicking a preset must not export the entire customer SQLite
  // database when no actual printer preference changed.
  const unchanged = (Object.keys(next) as Array<keyof PrintSettings>)
    .every((key) => key === "updatedAt" || Object.is(next[key], settings[key]));
  if (unchanged) return getPrintSettings();
  settings = next;
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
    labelLayout: value.labelLayout === "compact" || value.labelLayout === "detailed" ? value.labelLayout : defaults.labelLayout,
    labelColumns: value.labelColumns === 2 ? 2 : 1,
    labelRollWidthMm: Number.isFinite(Number(value.labelRollWidthMm)) ? Math.max(40, Math.min(120, Number(value.labelRollWidthMm))) : defaults.labelRollWidthMm,
    labelGapMm: Number.isFinite(Number(value.labelGapMm)) ? Math.max(0, Math.min(30, Number(value.labelGapMm))) : defaults.labelGapMm,
    labelLeftMarginMm: Number.isFinite(Number(value.labelLeftMarginMm)) ? Math.max(0, Math.min(50, Number(value.labelLeftMarginMm))) : defaults.labelLeftMarginMm,
    labelRowGapMm: Number.isFinite(Number(value.labelRowGapMm)) ? Math.max(0, Math.min(20, Number(value.labelRowGapMm))) : defaults.labelRowGapMm,
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

/** Explicit IDs must not override the requested document type or paper. */
export function getPrintTemplateFor(
  documentKind: PrintDocumentKind, paper: PrintPaper, templateId?: string,
): PrintDocumentTemplate {
  const selected = templateId ? getPrintTemplateById(templateId) : null;
  return selected?.documentKind === documentKind && selected.paper === paper
    ? selected : getPrintTemplate(documentKind, paper);
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
  // Two rapid duplicate clicks may share a millisecond. Reusing the ID
  // would make save/delete act on more than one customer template.
  const baseId = `custom-${Date.now()}`;
  let nextId = baseId;
  let suffix = 1;
  while (settings.templates.some((item) => item.id === nextId)) {
    nextId = `${baseId}-${suffix++}`;
  }
  const copy = sanitizePrintTemplate({
    ...source,
    id: nextId,
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
