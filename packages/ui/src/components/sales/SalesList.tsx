"use client";

import * as React from "react";
import type { Sale, Customer } from "@minarvabiz/types";
import type { InvoiceGrossProfit } from "@minarvabiz/business-logic";
import { exportSalesHistoryCsv } from "@minarvabiz/business-logic";
import { DataTable, type Column } from "../data/DataTable";
import { formatMoney } from "../customers/format";
import { isUnpaidSale, canCollectCustomerDueFromSale } from "./unpaid-sale-filter";
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
  onCollectCustomerDue,
  onShowProfit,
  buildPreviewHtml,
}: {
  sales: Sale[];
  customers?: Customer[];
  onSelect?: (sale: Sale) => void;
  onPrintA4?: (sale: Sale) => void;
  onPrintThermal?: (sale: Sale) => void;
  onCreateReturn?: (sale: Sale) => void;
  onCollectCustomerDue?: (sale: Sale) => void;
  onShowProfit?: (sale: Sale) => InvoiceGrossProfit;
  buildPreviewHtml?: SalePreviewBuilder;
}) {
  const [previewSale, setPreviewSale] = React.useState<Sale | null>(null);
  const [previewPaper, setPreviewPaper] = React.useState<"a4" | "thermal">("a4");
  const [detailSale, setDetailSale] = React.useState<Sale | null>(null);
  const [profit, setProfit] = React.useState<InvoiceGrossProfit | null>(null);
  const [profitError, setProfitError] = React.useState<string | null>(null);
  React.useEffect(() => { if (!onShowProfit) { setProfit(null); setProfitError(null); } }, [onShowProfit]);
  function requestProfit(sale: Sale) {
    setProfit(null);
    setProfitError(null);
    if (!onShowProfit) return;
    try { setProfit(onShowProfit(sale)); }
    catch (error) { setProfitError(error instanceof Error ? error.message : "Invoice profit is unavailable"); }
  }
  const [query, setQuery] = React.useState("");
  const [customerId, setCustomerId] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [unpaidOnly, setUnpaidOnly] = React.useState(false);
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [exportNotice, setExportNotice] = React.useState<{ error: boolean; text: string } | null>(null);

  const filteredSales = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sales.filter((sale) => {
      if (customerId === "__walkin" && sale.customerId) return false;
      if (customerId && customerId !== "__walkin" && sale.customerId !== customerId) return false;
      if (status && sale.status !== status) return false;
      if (unpaidOnly && !isUnpaidSale(sale)) return false;
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
  }, [sales, customerId, status, unpaidOnly, dateFrom, dateTo, query]);

  const clearFilters = () => {
    setQuery("");
    setCustomerId("");
    setStatus("");
    setUnpaidOnly(false);
    setDateFrom("");
    setDateTo("");
  };

  function downloadFilteredCsv() {
    if (filteredSales.length === 0) return;
    try {
      const content = exportSalesHistoryCsv(filteredSales);
      const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff), content], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `minarvabiz-sales-history-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      try {
        link.click();
        setExportNotice({ error: false, text: `Export requested for ${filteredSales.length} filtered invoice(s).` });
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      setExportNotice({
        error: true,
        text: error instanceof Error ? `Invoice CSV export failed: ${error.message}` : "Invoice CSV export failed.",
      });
    }
  }

  const columns: Column<Sale>[] = [
    {
      key: "id",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-1" onClick={(event) => event.stopPropagation()}>
          <Button size="sm" variant="outline" onClick={() => setDetailSale(row)}>Details</Button>
          {onCollectCustomerDue && canCollectCustomerDueFromSale(row) && <Button size="sm" variant="outline" onClick={() => onCollectCustomerDue(row)}>Collect customer due</Button>}
          {buildPreviewHtml && <Button size="sm" variant="outline" onClick={() => { setPreviewPaper("a4"); setPreviewSale(row); }}>Preview</Button>}
          {onShowProfit && ["completed", "partial"].includes(row.status) && <Button size="sm" variant="outline" onClick={() => requestProfit(row)}>Gross profit</Button>}
          {onPrintA4 && <Button size="sm" variant="outline" onClick={() => onPrintA4(row)}>A4</Button>}
          {onPrintThermal && <Button size="sm" variant="outline" onClick={() => onPrintThermal(row)}>Thermal</Button>}
          {onCreateReturn && ["completed", "partial"].includes(row.status) && (
            <Button size="sm" variant="outline" onClick={() => onCreateReturn(row)}>Cancel / Return / Refund</Button>
          )}
        </div>
      ),
    },
    { key: "invoiceNumber", header: "Invoice", render: (row) => <span className="font-medium text-slate-900">{row.invoiceNumber}</span> },
    { key: "customerName", header: "Customer", render: (row) => row.customerName || "Walk-in" },
    { key: "total", header: "Total", render: (row) => formatMoney(row.total) },
    { key: "paidAmount", header: "Paid", render: (row) => formatMoney(row.paidAmount) },
    { key: "balanceAmount", header: "Balance", render: (row) => <span className={row.balanceAmount > 0 ? "text-rose-600" : "text-slate-500"}>{formatMoney(row.balanceAmount)}</span> },
    { key: "status", header: "Status", render: (row) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[row.status] ?? ""}`}>{row.status}</span> },
    { key: "saleDate", header: "Date", render: (row) => new Date(row.saleDate).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) },

  ];

  const previewHtml = previewSale && buildPreviewHtml ? buildPreviewHtml(previewSale, previewPaper) : "";

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Sales History</h2>
            <p className="text-sm text-slate-500">{filteredSales.length} of {sales.length} invoices</p>
            <p className="mt-1 text-sm text-slate-500">To cancel a posted bill, choose Cancel / Return / Refund and select all remaining items. The original invoice stays in history.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={downloadFilteredCsv} disabled={filteredSales.length === 0}>Export filtered CSV</Button>
            <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
          </div>
        </div>

        {profitError && <p role="alert" className="text-sm text-rose-700">{profitError}</p>}
        {exportNotice && <p role={exportNotice.error ? "alert" : "status"} className={`text-sm ${exportNotice.error ? "text-rose-700" : "text-slate-600"}`}>{exportNotice.text}</p>}
        <p className="text-xs text-slate-500">CSV exports exactly the displayed invoice selection, including any cancelled or returned bills. For net revenue and tax totals, use Reports.</p>
        {onCollectCustomerDue && <p className="text-xs text-slate-500">Collect customer due opens Payments. Payments settle the customer’s oldest unpaid receivables first; the collection is not reserved for this particular invoice. Walk-in invoices without a customer account cannot use this action.</p>}

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

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="size-4 accent-indigo-600" checked={unpaidOnly} onChange={(event) => setUnpaidOnly(event.target.checked)} />
          Unpaid invoices only
        </label>

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
          {onCollectCustomerDue && canCollectCustomerDueFromSale(detailSale) && <Button onClick={() => { onCollectCustomerDue(detailSale); setDetailSale(null); }}>Collect customer due</Button>}
          {onCreateReturn && ["completed", "partial"].includes(detailSale.status) && <Button onClick={() => { onCreateReturn(detailSale); setDetailSale(null); }}>Cancel / Return / Refund</Button>}
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

      <Modal open={Boolean(profit && onShowProfit)}
        title={profit ? `Invoice ${profit.invoiceNumber} — Gross profit` : "Invoice gross profit"}
        onClose={() => setProfit(null)}
        footer={<Button variant="outline" onClick={() => setProfit(null)}>Close</Button>}
      >
        {profit && onShowProfit && <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <span>Revenue excluding tax</span><strong className="text-right">{formatMoney(profit.revenueExcludingTax)}</strong>
            <span>Historical cost of goods</span><strong className="text-right">{formatMoney(profit.historicalCostOfGoods)}</strong>
            <span>Original invoice gross profit</span><strong className="text-right">{formatMoney(profit.grossProfit)}</strong>
            <span>Gross margin</span><strong className="text-right">{profit.grossMarginPercent.toFixed(2)}%</strong>
          </div>
          <p className="text-xs text-slate-600">Internal management estimate for the original invoice only. Tax is excluded. Subsequent returns/refunds, operating costs and net profit are not included. Historical sale-line costs are used, not current catalogue costs.</p>
        </div>}
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
