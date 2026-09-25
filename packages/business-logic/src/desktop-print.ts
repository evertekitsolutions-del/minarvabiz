import { getPrintSettings } from "./print-settings";

export type DesktopPrintPaper = "a4" | "thermal" | "label";

type DesktopPrintInput = {
  html: string;
  deviceName?: string | null;
  paper?: DesktopPrintPaper;
  thermalWidthMm?: number;
  labelWidthMm?: number;
  labelHeightMm?: number;
  silent?: boolean;
};

type DesktopPrintBridge = {
  printHtml?: (input: DesktopPrintInput) => Promise<{ ok: boolean; error?: string }>;
};

function bridge(): DesktopPrintBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { minarvaDesktop?: DesktopPrintBridge }).minarvaDesktop ?? null;
}

function configuredPrinter(paper: DesktopPrintPaper) {
  const settings = getPrintSettings();
  if (paper === "a4") return settings.a4PrinterName;
  if (paper === "label") return settings.labelPrinterName || settings.thermalPrinterName;
  return settings.thermalPrinterName;
}

export function tryDesktopPrintHtml(
  html: string,
  paper: DesktopPrintPaper,
  options?: { labelWidthMm?: number; labelHeightMm?: number },
): boolean {
  const api = bridge();
  if (!api?.printHtml) return false;

  const settings = getPrintSettings();
  const deviceName = configuredPrinter(paper);
  const silent = Boolean(settings.silentDesktopPrint && deviceName);

  void api.printHtml({
    html,
    deviceName: deviceName || undefined,
    paper,
    thermalWidthMm: settings.thermalWidthMm,
    labelWidthMm: options?.labelWidthMm ?? settings.labelWidthMm,
    labelHeightMm: options?.labelHeightMm ?? settings.labelHeightMm,
    silent,
  }).then((result) => {
    if (!result.ok) {
      console.error("[minarvabiz] print failed:", result.error || "Unknown printer error");
    }
  }).catch((error) => console.error("[minarvabiz] print failed:", error));

  return true;
}
