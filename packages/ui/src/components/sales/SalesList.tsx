"use client";

import * as React from "react";
import type { Sale, Customer } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { formatMoney } from "../customers/format";
import { Button } from "../Button";
import { Modal } from "../forms/Modal";
import { inputClass, selectClass } from "../forms/FormField";
import { PrintPreviewModal } from "../printing/PrintPreviewModal";

export type SalePreviewBuilder = (sale: Sale, paper: "a4" | "thermal") => string;

const statusStyle: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  draft: "bg-slate-100 text-slate-600",
  cancelled: "bg-rose-50 text-rose-700",
  returned: "bg-violet-50 text-violet-700",
};

function dateKey(value: string) {
  return String(value || "").slice(0, 10);
}

export function SalesList({
  sales,
  customers = [],
  onSelect,
  onPrintA4,
  onPrintThermal,
  onCreateReturn,
  buildPreviewHtml,
}: {
  sales: Sale[];
  customers?: Customer[];
  onSelect?: (sale: Sale) => void;
  onPrintA4?: (sale: Sale) => void;
  onPrintThermal?: (sale: Sale) => void;
  onCreateReturn?: (sale: Sale) => void;
  buildPreviewHtml?: SalePreviewBuilder;
}) {
  const [previewSale, setPreviewSale] = React.useState<Sale | null>(null);
  const [previewPaper, setPreviewPaper] = React.useState<"a4" | "thermal">("a4");
  const [detailSale, setDetailSale] = React.useState<Sale | null>(null);
  const [query, setQuery] = React.useState("");
  const [customerId, setCustomerId] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  const filteredSales = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sales.filter((sale) => {
      if (customerId === "__walkin" && sale.customerId) return false;
      if (customerId && customerId !== "__walkin" && sale.customerId !== customerId) return false;
      if (status && sale.status !== status) return false;
      const key = dateKey(sale.saleDate);
      if (dateFrom && key < dateFrom) return false;
      if (dateTo && key > dateTo) return false;
      if (!normalized) return true;
      return [
        sale.invoiceNumber,
        sale.customerName || "Walk-in",
        sale.notes || "",
        ...sale.items.flatMap((item) => [item.productName, item.sku || ""]),
      ].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [sales, customerId, status, dateFrom, dateTo, query]);

  const clearFilters = () => {
    setQuery("");
    setCustomerId("");
    setStatus("");
    setDateFrom("");
    setDateTo("");
  };

  const columns: Column<Sale>[] = [
    { key: "invoiceNumber", header: "Invoice", render: (row) => <span className="font-medium text-slate-900">{row.invoiceNumber}</span> },
    { key: "customerName", header: "Customer", render: (row) => row.customerName || "Walk-in" },
    { key: "total", header: "Total", render: (row) => formatMoney(row.total) },
    { key: "paidAmount", header: "Paid", render: (row) => formatMoney(row.paidAmount) },
    { key: "balanceAmount", header: "Balance", render: (row) => <span className={row.balanceAmount > 0 ? "text-rose-600" : "text-slate-500"}>{formatMoney(row.balanceAmount)}</span> },
    { key: "status", header: "Status", render: (row) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[row.status] ?? ""}`}>{row.status}</span> },
    { key: "saleDate", header: "Date", render: (row) => new Date(row.saleDate).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) },
    {
      key: "id",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-1" onClick={(event) => event.stopPropagation()}>
          <Button size="sm" variant="outline" onClick={() => setDetailSale(row)}>Details</Button>
          {buildPreviewHtml && <Button size="sm" variant="outline" onClick={() => { setPreviewPaper("a4"); setPreviewSale(row); }}>Preview</Button>}
          {onPrintA4 && <Button size="sm" variant="outline" onClick={() => onPrintA4(row)}>A4</Button>}
          {onPrintThermal && <Button size="sm" variant="outline" onClick={() => onPrintThermal(row)}>Thermal</Button>}
          {onCreateReturn && ["completed", "partial"].includes(row.status) && (
            <Button size="sm" variant="outline" onClick={() => onCreateReturn(row)}>Return / Refund</Button>
          )}
        </div>
      ),
    },
  ];

  const previewHtml = previewSale && buildPreviewHtml ? buildPreviewHtml(previewSale, previewPaper) : "";

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Sales History</h2>
            <p className="text-sm text-slate-500">{filteredSales.length} of {sales.length} invoices</p>
          </div>
          <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
        </div>

        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-medium text-slate-600 lg:col-span-2">
            Search invoice, customer, product or SKU
            <input className={inputClass + " mt-1"} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Customer
            <select className={selectClass + " mt-1"} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">All customers</option>
              <option value="__walkin">Walk-in</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Status
            <select className={selectClass + " mt-1"} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {["completed", "partial", "draft", "cancelled", "returned"].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-slate-600">
              From
              <input type="date" className={inputClass + " mt-1"} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="text-xs font-medium text-slate-600">
              To
              <input type="date" className={inputClass + " mt-1"} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={filteredSales}
          onRowClick={(sale) => { setDetailSale(sale); onSelect?.(sale); }}
          emptyMessage="No invoices match the selected filters"
        />
      </div>

      <Modal
        open={Boolean(detailSale)}
        title={detailSale ? `Invoice ${detailSale.invoiceNumber}` : "Invoice details"}
        onClose={() => setDetailSale(null)}
        footer={detailSale ? <>
          <Button variant="outline" onClick={() => setDetailSale(null)}>Close</Button>
          {onCreateReturn && ["completed", "partial"].includes(detailSale.status) && <Button onClick={() => { onCreateReturn(detailSale); setDetailSale(null); }}>Return / Refund</Button>}
        </> : undefined}
      >
        {detailSale && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-blue-800">
              Posted invoices are financial records and are not hard-deleted or directly rewritten. Use Return / Refund for stock and accounting-safe corrections.
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><div className="text-xs text-slate-500">Customer</div><div className="font-medium text-slate-900">{detailSale.customerName || "Walk-in"}</div></div>
              <div><div className="text-xs text-slate-500">Date</div><div className="font-medium text-slate-900">{new Date(detailSale.saleDate).toLocaleString("en-IN")}</div></div>
              <div><div className="text-xs text-slate-500">Status</div><div className="font-medium text-slate-900">{detailSale.status}</div></div>
              <div><div className="text-xs text-slate-500">Balance</div><div className="font-medium text-slate-900">{formatMoney(detailSale.balanceAmount)}</div></div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Rate</th><th className="px-3 py-2">Amount</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {detailSale.items.map((item) => <tr key={item.id}><td className="px-3 py-2">{item.productName}{item.sku ? <div className="text-xs text-slate-400">{item.sku}</div> : null}</td><td className="px-3 py-2">{item.quantity}</td><td className="px-3 py-2">{formatMoney(item.unitPrice)}</td><td className="px-3 py-2">{formatMoney(item.lineTotal)}</td></tr>)}
                </tbody>
              </table>
            </div>
            <div className="ml-auto grid max-w-sm grid-cols-2 gap-2">
              <span className="text-slate-500">Subtotal</span><span className="text-right">{formatMoney(detailSale.subtotal)}</span>
              <span className="text-slate-500">Discount</span><span className="text-right">{formatMoney(detailSale.discountAmount)}</span>
              <span className="text-slate-500">Tax</span><span className="text-right">{formatMoney(detailSale.taxAmount)}</span>
              <span className="font-semibold text-slate-900">Total</span><span className="text-right font-semibold text-slate-900">{formatMoney(detailSale.total)}</span>
            </div>
            {detailSale.notes && <div><div className="text-xs text-slate-500">Notes</div><div className="mt-1 whitespace-pre-wrap text-slate-700">{detailSale.notes}</div></div>}
          </div>
        )}
      </Modal>

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
