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
  silentDesktopPrint: boolean;
  updatedAt: string;
}

const defaults: PrintSettings = {
  defaultInvoicePaper: "a4",
  thermalWidthMm: 80,
  a4PrinterName: "",
  thermalPrinterName: "",
  silentDesktopPrint: false,
  updatedAt: nowISO(),
};

let settings: PrintSettings = { ...defaults };

export function getPrintSettings(): PrintSettings {
  return { ...settings };
}

export function updatePrintSettings(patch: Partial<PrintSettings>): PrintSettings {
  const width = patch.thermalWidthMm === 58 ? 58 : patch.thermalWidthMm === 80 ? 80 : settings.thermalWidthMm;
  settings = {
    ...settings,
    ...patch,
    thermalWidthMm: width,
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
    updatedAt: value.updatedAt || nowISO(),
  };
}
