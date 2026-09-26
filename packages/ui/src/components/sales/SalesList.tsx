"use client";

import * as React from "react";
import type { Sale, Customer } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { formatMoney } from "../customers/format";
import { Button } from "../Button";
import { PrintPreviewModal } from "../printing/PrintPreviewModal";

export type SalePreviewBuilder = (sale: Sale, paper: "a4" | "thermal") => string;

const statusStyle: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  draft: "bg-slate-100 text-slate-600",
  cancelled: "bg-rose-50 text-rose-700",
  returned: "bg-violet-50 text-violet-700",
};

export function SalesList({
  sales,
  customers: _customers,
  onSelect,
  onPrintA4,
  onPrintThermal,
  buildPreviewHtml,
}: {
  sales: Sale[];
  customers?: Customer[];
  onSelect?: (sale: Sale) => void;
  onPrintA4?: (sale: Sale) => void;
  onPrintThermal?: (sale: Sale) => void;
  buildPreviewHtml?: SalePreviewBuilder;
}) {
  const [previewSale, setPreviewSale] = React.useState<Sale | null>(null);
  const [previewPaper, setPreviewPaper] = React.useState<"a4" | "thermal">("a4");

  const columns: Column<Sale>[] = [
    { key: "invoiceNumber", header: "Invoice", render: (row) => <span className="font-medium text-slate-900">{row.invoiceNumber}</span> },
    { key: "customerName", header: "Customer", render: (row) => row.customerName || "Walk-in" },
    { key: "total", header: "Total", render: (row) => formatMoney(row.total) },
    { key: "paidAmount", header: "Paid", render: (row) => formatMoney(row.paidAmount) },
    { key: "balanceAmount", header: "Balance", render: (row) => <span className={row.balanceAmount > 0 ? "text-rose-600" : "text-slate-500"}>{formatMoney(row.balanceAmount)}</span> },
    { key: "status", header: "Status", render: (row) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[row.status] ?? ""}`}>{row.status}</span> },
    { key: "saleDate", header: "Date", render: (row) => new Date(row.saleDate).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) },
    ...(onPrintA4 || onPrintThermal || buildPreviewHtml ? [{
      key: "id" as keyof Sale,
      header: "Preview / Print",
      render: (row: Sale) => (
        <div className="flex flex-wrap gap-1" onClick={(event) => event.stopPropagation()}>
          {buildPreviewHtml && <Button size="sm" variant="outline" onClick={() => { setPreviewPaper("a4"); setPreviewSale(row); }}>Preview</Button>}
          {onPrintA4 && <Button size="sm" variant="outline" onClick={() => onPrintA4(row)}>A4</Button>}
          {onPrintThermal && <Button size="sm" variant="outline" onClick={() => onPrintThermal(row)}>Thermal</Button>}
        </div>
      ),
    }] : []),
  ];

  const previewHtml = previewSale && buildPreviewHtml ? buildPreviewHtml(previewSale, previewPaper) : "";

  return (
    <>
      <div className="space-y-4">
        <div><h2 className="text-xl font-semibold text-slate-900">Sales</h2><p className="text-sm text-slate-500">{sales.length} invoices</p></div>
        <DataTable columns={columns} rows={sales} onRowClick={onSelect} emptyMessage="No sales yet" />
      </div>
      <PrintPreviewModal
        open={Boolean(previewSale && buildPreviewHtml)}
        title={previewSale ? `Invoice ${previewSale.invoiceNumber}` : "Invoice preview"}
        html={previewHtml}
        paper={previewPaper}
        onPaperChange={setPreviewPaper}
        onClose={() => setPreviewSale(null)}
        onPrint={previewSale ? () => previewPaper === "a4" ? onPrintA4?.(previewSale) : onPrintThermal?.(previewSale) : undefined}
      />
    </>
  );
}
