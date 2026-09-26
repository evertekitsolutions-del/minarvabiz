"use client";

import * as React from "react";
import type { Sale, Customer } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { formatMoney } from "../customers/format";
import { Button } from "../Button";
import { PrintPreviewModal } from "../printing/PrintPreviewModal";
import { buildSaleInvoiceHtml } from "@minarvabiz/business-logic";

const statusStyle: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  draft: "bg-slate-100 text-slate-600",
  cancelled: "bg-rose-50 text-rose-700",
  returned: "bg-violet-50 text-violet-700",
};

export function SalesList({ sales, customers: _customers, onSelect, onPrintA4, onPrintThermal }: { sales: Sale[]; customers?: Customer[]; onSelect?: (s: Sale) => void; onPrintA4?: (s: Sale) => void; onPrintThermal?: (s: Sale) => void }) {
  const [preview, setPreview] = React.useState<{ sale: Sale; paper: "a4" | "thermal"; html: string } | null>(null);
  function openPreview(sale: Sale, paper: "a4" | "thermal") {
    setPreview({ sale, paper, html: buildSaleInvoiceHtml(sale, { paper, autoPrint: false }) });
  }
  const columns: Column<Sale>[] = [
    { key: "invoiceNumber", header: "Invoice", render: (r) => <span className="font-medium text-slate-900">{r.invoiceNumber}</span> },
    { key: "customerName", header: "Customer", render: (r) => r.customerName || "Walk-in" },
    { key: "total", header: "Total", render: (r) => formatMoney(r.total) },
    { key: "paidAmount", header: "Paid", render: (r) => formatMoney(r.paidAmount) },
    { key: "balanceAmount", header: "Balance", render: (r) => <span className={r.balanceAmount > 0 ? "text-rose-600" : "text-slate-500"}>{formatMoney(r.balanceAmount)}</span> },
    { key: "status", header: "Status", render: (r) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[r.status] ?? ""}`}>{r.status}</span> },
    { key: "saleDate", header: "Date", render: (r) => new Date(r.saleDate).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) },
    ...(onPrintA4 || onPrintThermal ? [{
      key: "id" as keyof Sale,
      header: "Preview / Print",
      render: (r: Sale) => <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>{onPrintA4 && <Button size="sm" variant="outline" onClick={() => openPreview(r, "a4")}>A4 Preview</Button>}{onPrintThermal && <Button size="sm" variant="outline" onClick={() => openPreview(r, "thermal")}>Thermal Preview</Button>}</div>,
    }] : []),
  ];
  return <div className="space-y-4">
    <div><h2 className="text-xl font-semibold text-slate-900">Sales</h2><p className="text-sm text-slate-500">{sales.length} invoices</p></div>
    <DataTable columns={columns} rows={sales} onRowClick={onSelect} emptyMessage="No sales yet" />
    {preview && <PrintPreviewModal
      open
      title={`Invoice ${preview.sale.invoiceNumber}`}
      html={preview.html}
      paper={preview.paper}
      onClose={() => setPreview(null)}
      onPrint={() => preview.paper === "a4" ? onPrintA4?.(preview.sale) : onPrintThermal?.(preview.sale)}
    />}
  </div>;
}
