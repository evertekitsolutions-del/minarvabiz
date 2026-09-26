import * as React from "react";
import type { Sale, Quotation, Product } from "@minarvabiz/types";
import { PrintPreviewModal } from "@minarvabiz/ui";
import {
  buildSaleInvoiceHtml,
  buildQuotationHtml,
  buildBarcodeLabelHtml,
  printPreparedHtml,
  type PrintPaper,
} from "@minarvabiz/business-logic";

type PreviewState = {
  title: string;
  html: string;
  paper: "a4" | "thermal" | "label";
  labelWidthMm?: number;
  labelHeightMm?: number;
} | null;

export function useDesktopPrintPreview() {
  const [preview, setPreview] = React.useState<PreviewState>(null);

  function openSale(sale: Sale, paper: PrintPaper) {
    setPreview({
      title: `${sale.invoiceNumber} — ${paper === "a4" ? "A4" : "Thermal"} Preview`,
      html: buildSaleInvoiceHtml(sale, { paper, autoPrint: false }),
      paper,
    });
  }

  function openQuotation(quotation: Quotation, paper: PrintPaper) {
    setPreview({
      title: `${quotation.quotationNumber} — ${paper === "a4" ? "A4" : "Thermal"} Preview`,
      html: buildQuotationHtml(quotation, { paper, autoPrint: false }),
      paper,
    });
  }

  function openLabel(product: Product, options: { copies: number; categoryName?: string | null; labelWidthMm: number; labelHeightMm: number }) {
    setPreview({
      title: `${product.name} — Label Preview`,
      html: buildBarcodeLabelHtml(product, {
        copies: options.copies,
        categoryName: options.categoryName,
        autoPrint: false,
        labelWidthMm: options.labelWidthMm,
        labelHeightMm: options.labelHeightMm,
      }),
      paper: "label",
      labelWidthMm: options.labelWidthMm,
      labelHeightMm: options.labelHeightMm,
    });
  }

  const modal = (
    <PrintPreviewModal
      open={Boolean(preview)}
      title={preview?.title || "Print Preview"}
      html={preview?.html || ""}
      paper={preview?.paper || "a4"}
      onClose={() => setPreview(null)}
      onPrint={() => {
        if (!preview) return;
        printPreparedHtml(preview.html, preview.paper, {
          labelWidthMm: preview.labelWidthMm,
          labelHeightMm: preview.labelHeightMm,
        });
      }}
    />
  );

  return { preview, openSale, openQuotation, openLabel, close: () => setPreview(null), modal };
}
