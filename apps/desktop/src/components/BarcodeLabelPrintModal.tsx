import * as React from "react";
import { Modal, Button, FormField, inputClass } from "@minarvabiz/ui";
import { buildBarcodeLabelHtml, requestDesktopPrintHtml, sendBarcodeLabelsToPrinter, updatePrintSettings, CROMO_38X25_2UP_NOGAP_PRESET, type PrintSettings } from "@minarvabiz/business-logic";
import type { Product } from "@minarvabiz/types";

type LabelSettings = Pick<PrintSettings, "labelWidthMm" | "labelHeightMm" | "labelCodeMode" | "labelLayout" | "labelColumns" | "labelRollWidthMm" | "labelGapMm" | "labelLeftMarginMm" | "labelRowGapMm" | "labelPrinterName" | "thermalPrinterName">;

export function BarcodeLabelPrintModal({
  product, categoryName, copies, onCopiesChange, onClose, onError, settings, onUseTwoUp,
}: {
  product: Product | null;
  categoryName?: string | null;
  copies: string;
  onCopiesChange: (value: string) => void;
  onClose: () => void;
  onError: (error: string | null) => void;
  settings: LabelSettings;
  onUseTwoUp: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const labelDevice = settings.labelPrinterName;
  const count = Math.max(1, Math.min(100, Number.parseInt(copies, 10) || 1));
  const columns = settings.labelColumns === 2 ? 2 : 1;
  const pageHeight = settings.labelHeightMm + (columns === 2 ? settings.labelRowGapMm : 0);
  const pageWidth = columns === 2 ? settings.labelRollWidthMm : settings.labelWidthMm;
  const rows = Math.ceil(count / columns);

  const preview = React.useMemo(() => {
    if (!product) return { html: "", error: null as string | null };
    try {
      return {
        html: buildBarcodeLabelHtml(product, {
          categoryName, copies: Math.max(1, Math.min(100, Number.parseInt(copies, 10) || 1)),
          autoPrint: false, labelWidthMm: settings.labelWidthMm, labelHeightMm: settings.labelHeightMm,
        }), error: null as string | null,
      };
    } catch (error) {
      return { html: "", error: error instanceof Error ? error.message : String(error) };
    }
  }, [product, categoryName, copies, settings]);

  async function printDirect() {
    if (!product || busy) return;
    if (!product.barcode) return onError("Generate a barcode before printing the label.");
    if (!labelDevice) { const error="Select the Barcode label printer in Settings; do not use the POS receipt printer."; setMessage(`Error: ${error}`); return onError(error); }
    if (preview.error) return onError(preview.error);
    setBusy(true);
    setMessage(null);
    onError(null);
    try {
      const result = await sendBarcodeLabelsToPrinter(product, count, categoryName);
      if (!result.ok) { const error=result.error || "Label printer rejected the job."; setMessage(`Error: ${error}`); onError(error); }
      else setMessage("Label job accepted by the selected Windows printer. Verify the first printed row for alignment.");
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function printWithDialog() {
    if (!product || busy) return;
    if (!product.barcode) return onError("Generate a barcode before printing the label.");
    if (!labelDevice) { const error="Select the Barcode label printer in Settings; do not use the POS receipt printer."; setMessage(`Error: ${error}`); return onError(error); }
    if (preview.error) return onError(preview.error);
    setBusy(true);
    setMessage(null);
    onError(null);
    try {
      // This is explicitly the MANUAL Windows dialog path: ignore a globally
      // saved "silent desktop print" preference. Do not open a second
      // browser window or submit a hidden duplicate print job.
      const result = await requestDesktopPrintHtml(preview.html, "label", {
        labelWidthMm: pageWidth,
        labelHeightMm: pageHeight,
        silent: false,
      });
      if (!result?.ok) {
        const error = result?.error || "Windows label print dialog is unavailable.";
        setMessage(`Error: ${error}`);
        onError(error);
      } else {
        setMessage("Label print job accepted by Windows. Verify sticker alignment.");
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setMessage(`Error: ${reason}`);
      onError(reason);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!product} title="Print Barcode Label" onClose={onClose}
      footer={<>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" variant="outline" onClick={() => { void printWithDialog(); }} disabled={busy}>Windows print dialog</Button>
        <Button type="button" onClick={() => { void printDirect(); }} disabled={busy || !!preview.error}>
          {busy ? "Sending…" : "Print directly"}
        </Button>
      </>}>
      <div className="space-y-3">
        <p className="text-sm font-medium">{product?.name}</p>
        <p className="text-xs text-slate-500">Barcode: {product?.barcode || "Not generated"}</p>
        <FormField label="Number of stickers">
          <input className={inputClass} type="number" min="1" max="100"
            value={copies} onChange={(event) => onCopiesChange(event.target.value)} />
        </FormField>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <Button type="button" size="sm" variant="outline" onClick={() => {
            // Reapplying the CROMO preset must not erase row-pitch/edge
            // calibration saved after a successful three-row printer test.
            const previouslyCalibrated = settings.labelColumns === 2
              && settings.labelWidthMm === 38 && settings.labelHeightMm === 25;
            updatePrintSettings({
              ...CROMO_38X25_2UP_NOGAP_PRESET,
              ...(previouslyCalibrated ? {
                labelRowGapMm: settings.labelRowGapMm,
                labelLeftMarginMm: settings.labelLeftMarginMm,
                labelRollWidthMm: settings.labelRollWidthMm,
                labelGapMm: settings.labelGapMm,
              } : {}),
            });
            onUseTwoUp();
            if (count < 2) onCopiesChange("2");
            setMessage(null);
          }}>Use CROMO 38×25 — 2-up / NO GAP</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => {
            updatePrintSettings({labelColumns:2,labelRollWidthMm:101.6,labelWidthMm:38,labelHeightMm:38,labelGapMm:3,labelLeftMarginMm:11.3,labelRowGapMm:0});
            onUseTwoUp();
            if (count < 2) onCopiesChange("2");
            setMessage(null);
          }}>Use 4-inch roll — 2 stickers per row</Button>
          <span className="text-xs text-slate-700">{columns} across · {count} stickers · {rows} {rows === 1 ? "row" : "rows"}</span>
        </div>
        {product && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-800">In-app print preview — exact paper layout</p>
          <p className="mb-2 text-xs text-slate-600">
            {pageWidth} mm page width × {pageHeight} mm feed · {settings.labelWidthMm} × {settings.labelHeightMm} mm stickers · {columns} across · {settings.labelCodeMode}{columns===2 ? ` · gap ${settings.labelGapMm} mm · left offset ${settings.labelLeftMarginMm} mm` : ""}
          </p>
          {preview.error ? <p role="alert" className="text-sm text-red-700">{preview.error}</p> : (
            <div className="max-w-full overflow-x-auto">
              <iframe title="Product barcode label preview" sandbox="" srcDoc={preview.html}
                className="block border border-slate-300 bg-white"
                style={{
                  width: `${pageWidth}mm`,
                  height: `${Math.min(rows, 3) * pageHeight + 2}mm`,
                  maxWidth: "none",
                }} />
            </div>
          )}
          <p className="mt-2 text-xs text-slate-600">
            Preview above shows the selected sticker count (scroll inside for more rows).
            Direct print sends this layout to the configured barcode printer without the Windows
            dialog, whose preview may say "No preview available". Each 2-up sticker row prints as a separate page. Set Row gap / feed gap in Settings to measured row pitch minus sticker height (for example 27 − 25 = 2 mm). Test THREE rows before printing products; a printer driver must use 100% / actual size. Reapplying this CROMO preset preserves your calibrated gap.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Selected barcode printer: {settings.labelPrinterName || "Not configured — select one in Settings → Printer settings"}.
          </p>
        </div>}
        {product && !product.size && <p className="text-xs text-amber-700">Size is blank in this product record. Edit the specific size variant to include Size on the printed label.</p>}
        {message && <p role={message.startsWith("Error:") ? "alert" : "status"} className={`text-sm ${message.startsWith("Error:") ? "text-red-700" : "text-emerald-700"}`}>{message}</p>}
      </div>
    </Modal>
  );
}
