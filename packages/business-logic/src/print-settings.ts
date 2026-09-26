/**
 * Printer and invoice-output preferences shared by web/desktop.
 * Desktop can use named Windows printers through the Electron bridge;
 * web falls back to the browser print dialog.
 */
import { nowISO } from "@minarvabiz/utils";
import { touchPersistence } from "./autosave";

export interface PrintSettings {
  defaultInvoicePaper: "a4" | "thermal";
  thermalWidthMm: 58 | 80;
  a4PrinterName: string;
  thermalPrinterName: string;
  labelPrinterName: string;
  labelWidthMm: number;
  labelHeightMm: number;
  silentDesktopPrint: boolean;
  invoiceA4TemplateId: string;
  invoiceThermalTemplateId: string;
  quotationA4TemplateId: string;
  quotationThermalTemplateId: string;
  labelCodeMode: "barcode" | "qr" | "both";
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
  silentDesktopPrint: false,
  invoiceA4TemplateId: "tpl-invoice-a4-professional",
  invoiceThermalTemplateId: "tpl-invoice-thermal-professional",
  quotationA4TemplateId: "tpl-quotation-a4-professional",
  quotationThermalTemplateId: "tpl-quotation-thermal-professional",
  labelCodeMode: "both",
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
    invoiceA4TemplateId: value.invoiceA4TemplateId || defaults.invoiceA4TemplateId,
    invoiceThermalTemplateId: value.invoiceThermalTemplateId || defaults.invoiceThermalTemplateId,
    quotationA4TemplateId: value.quotationA4TemplateId || defaults.quotationA4TemplateId,
    quotationThermalTemplateId: value.quotationThermalTemplateId || defaults.quotationThermalTemplateId,
    labelCodeMode: value.labelCodeMode === "barcode" || value.labelCodeMode === "qr" || value.labelCodeMode === "both" ? value.labelCodeMode : defaults.labelCodeMode,
    updatedAt: value.updatedAt || nowISO(),
  };
}
