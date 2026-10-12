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

export type DesktopPrintResult = { ok: boolean; error?: string };

/**
 * Submit native print to the Electron bridge and surface its response to
 * callers. A successful response means the request was accepted; it does
 * NOT prove paper came out of the physical printer.
 */
export function requestDesktopPrintHtml(
  html: string,
  paper: DesktopPrintPaper,
  options?: { labelWidthMm?: number; labelHeightMm?: number },
): Promise<DesktopPrintResult> | null {
  const api = bridge();
  if (!api?.printHtml) return null;

  const settings = getPrintSettings();
  const deviceName = configuredPrinter(paper);
  const silent = Boolean(settings.silentDesktopPrint && deviceName);

  try {
    return Promise.resolve(api.printHtml({
      html,
      deviceName: deviceName || undefined,
      paper,
      thermalWidthMm: settings.thermalWidthMm,
      labelWidthMm: options?.labelWidthMm ?? settings.labelWidthMm,
      labelHeightMm: options?.labelHeightMm ?? settings.labelHeightMm,
      silent,
    })).then((result) => result?.ok
      ? { ok: true }
      : { ok: false, error: result?.error || "Printer rejected the request" }
    ).catch((error: unknown) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
  } catch (error) {
    return Promise.resolve({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Legacy fire-and-forget bridge for existing non-invoice print callers. */
export function tryDesktopPrintHtml(
  html: string,
  paper: DesktopPrintPaper,
  options?: { labelWidthMm?: number; labelHeightMm?: number },
): boolean {
  const result = requestDesktopPrintHtml(html, paper, options);
  if (!result) return false;
  void result.then((outcome) => {
    if (!outcome.ok) console.error("[minarvabiz] print failed:", outcome.error);
  });
  return true;
}
