import * as React from "react";
import { Modal, Button, FormField, inputClass } from "@minarvabiz/ui";
import { buildBarcodeLabelHtml, printBarcodeLabels, type PrintSettings } from "@minarvabiz/business-logic";
import type { Product } from "@minarvabiz/types";

type LabelSettings = Pick<PrintSettings, "labelWidthMm" | "labelHeightMm" | "labelCodeMode" | "labelLayout" | "labelColumns" | "labelRollWidthMm" | "labelGapMm" | "labelLeftMarginMm">;

export function BarcodeLabelPrintModal({
  product, categoryName, copies, onCopiesChange, onClose, onError, settings,
}: {
  product: Product | null;
  categoryName?: string | null;
  copies: string;
  onCopiesChange: (value: string) => void;
  onClose: () => void;
  onError: (error: string | null) => void;
  settings: LabelSettings;
}) {
  const previewHtml = React.useMemo(() => product
    ? buildBarcodeLabelHtml(product, {
        categoryName, copies: settings.labelColumns === 2 ? 2 : 1, autoPrint: false,
        labelWidthMm: settings.labelWidthMm,
        labelHeightMm: settings.labelHeightMm,
      })
    : "", [product, categoryName, settings.labelWidthMm, settings.labelHeightMm, settings.labelCodeMode, settings.labelLayout, settings.labelColumns, settings.labelRollWidthMm, settings.labelGapMm, settings.labelLeftMarginMm]);

  const print = () => {
    if (!product) return;
    if (!product.barcode) {
      onError("Generate a barcode before printing the label.");
      return;
    }
    const count = Math.max(1, Math.min(100, Number.parseInt(copies, 10) || 1));
    onError(null);
    printBarcodeLabels(product, count, categoryName);
  };

  return (
    <Modal
      open={!!product}
      title="Print Barcode Label"
      onClose={onClose}
      footer={<>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" onClick={print}>Print Label</Button>
      </>}
    >
      <div className="space-y-3">
        <p className="text-sm font-medium">{product?.name}</p>
        <p className="text-xs text-slate-500">Barcode: {product?.barcode || "Not generated"}</p>
        <FormField label="Copies">
          <input className={inputClass} type="number" min="1" max="100"
            value={copies} onChange={(event) => onCopiesChange(event.target.value)} />
        </FormField>
        {product && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-800">Label preview — actual sticker size</p>
          <p className="mb-2 text-xs text-slate-500">
            {settings.labelWidthMm} × {settings.labelHeightMm} mm · {settings.labelColumns} across · {settings.labelCodeMode} · {settings.labelLayout} layout
          </p>
          <iframe title="Product barcode label preview" sandbox=""
            className="block border border-slate-300 bg-white"
            style={{ width: `${settings.labelColumns === 2 ? settings.labelRollWidthMm : settings.labelWidthMm}mm`, height: `${settings.labelHeightMm}mm`, maxWidth: "100%" }}
            srcDoc={previewHtml} />
          <p className="mt-2 text-xs text-slate-500">
            Change size, layout or printer in Settings → Printer settings.
            Windows may not support print preview; use this in-app preview instead.
          </p>
        </div>}
      </div>
    </Modal>
  );
}
