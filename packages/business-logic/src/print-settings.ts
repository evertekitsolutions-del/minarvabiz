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
    updatedAt: value.updatedAt || nowISO(),
  };
}
