"use client";

import * as React from "react";
import type { Product, Category } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { formatMoney } from "../customers/format";
import { Modal } from "../forms/Modal";
import { ProductGs1BarcodeAssistant } from "./ProductGs1BarcodeAssistant";
import { FormField, inputClass, selectClass } from "../forms/FormField";
import { can, buildAuthorizedStockCountWorksheet, buildAuthorizedStockCountReview, type StockCountReview } from "@minarvabiz/business-logic";

export function ProductList({
  products,
  categories,
  onAdd,
  onAddCategory,
  onSearch,
  onFilterCategory,
  onSelect,
  lowStockOnly,
  onToggleLowStock,
  onLowStockChange,
  onRefresh,
  onEdit,
  onAdjustStock,
  onArchive,
  onPrintBarcode,
}: {
  products: Product[];
  categories: Category[];
  onAdd?: () => void;
  onAddCategory?: () => void;
  onSearch?: (q: string) => void;
  onFilterCategory?: (id: string | null) => void;
  onSelect?: (p: Product) => void;
  lowStockOnly?: boolean;
  onToggleLowStock?: () => void;
  onLowStockChange?: (value: boolean) => void;
  onRefresh?: () => void;
  onEdit?: (p: Product) => void;
  onAdjustStock?: (p: Product) => void;
  onArchive?: (p: Product, reason: string) => { success?: boolean; error?: string } | void;
  onPrintBarcode?: (p: Product) => void;
}) {
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [archiveTarget, setArchiveTarget] = React.useState<Product | null>(null);
  const [archiveReason, setArchiveReason] = React.useState("");
  const [archiveError, setArchiveError] = React.useState<string | null>(null);
  const [countSheetError, setCountSheetError] = React.useState<string | null>(null);
  const [countReview, setCountReview] = React.useState<StockCountReview | null>(null);
  const countFileInput = React.useRef<HTMLInputElement>(null);

  function exportCountSheet() {
    setCountSheetError(null);
    try {
      const report = buildAuthorizedStockCountWorksheet();
      const blob = new Blob(["\uFEFF", report.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "minarvabiz-stock-count-" + report.snapshotAt.slice(0,10) + ".csv";
      document.body.appendChild(anchor);
      try { anchor.click(); }
      finally {
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      setCountSheetError(error instanceof Error ? error.message : "Unable to export stock count sheet");
    }
  }

  async function importCountSheet(file: File | undefined) {
    if (!file) return;
    setCountSheetError(null);
    setCountReview(null);
    try {
      if (file.size > 5_000_000) throw new Error("Count CSV must be 5 MB or smaller");
      // Parsing, tenant/branch scoping and stock-staleness checks are shared
      // by Windows and Web. This preview does not post adjustments.
      const result = buildAuthorizedStockCountReview(await file.text());
      setCountReview(result);
    } catch (error) {
      setCountSheetError(error instanceof Error ? error.message : "Unable to review stock count");
    }
  }

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  const columns: Column<Product>[] = [
    {
      key: "name",
      header: "Product",
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.name}</div>
          <div className="text-xs text-slate-500">
            {r.sku || "—"} {r.barcode ? `· ${r.barcode}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "categoryId",
      header: "Category",
      render: (r) => (r.categoryId ? catMap[r.categoryId] ?? "—" : "—"),
    },
    {
      key: "sellingPrice",
      header: "Price",
      render: (r) => formatMoney(r.sellingPrice),
    },
    {
      key: "stockQuantity",
      header: "Stock",
      render: (r) => {
        const low = r.stockQuantity <= r.minimumStock;
        return (
          <span className={low ? "font-semibold text-rose-600" : "text-slate-700"}>
            {r.stockQuantity} {r.unit}
            {low && <span className="ml-1 text-xs">(low)</span>}
          </span>
        );
      },
    },
    {
      key: "isActive",
      header: "Status",
      render: (r) => (
        <span
          className={
            r.isActive
              ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
              : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
          }
        >
          {r.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "id",
      header: "Actions",
      render: (r) => (
        <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
          {onEdit && <Button size="sm" variant="outline" onClick={() => onEdit(r)}>Edit</Button>}
          {onAdjustStock && <Button size="sm" variant="outline" onClick={() => onAdjustStock(r)}>Stock</Button>}
          {onPrintBarcode && <Button size="sm" variant="outline" onClick={() => onPrintBarcode(r)}>Label</Button>}
          {onArchive && <Button size="sm" variant="outline" onClick={() => { setArchiveTarget(r); setArchiveReason(""); setArchiveError(null); }}>Archive</Button>}
        </div>
      ),
    },
  ];

  const toggleLowStock = () => {
    if (onLowStockChange) onLowStockChange(!lowStockOnly);
    else onToggleLowStock?.();
    onRefresh?.();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Products & Inventory</h2>
          <p className="text-sm text-slate-500">{products.length} products</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            placeholder="Search name, SKU, barcode…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              onSearch?.(e.target.value);
            }}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm sm:w-56 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <select
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm focus:border-indigo-400 focus:outline-none"
            onChange={(e) => onFilterCategory?.(e.target.value || null)}
            defaultValue=""
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select className={selectClass + " h-10 sm:w-32"} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <Button variant={lowStockOnly ? "primary" : "outline"} onClick={toggleLowStock}>
            Low stock
          </Button>
          {can("inventory.adjust") && <>
            <Button variant="outline" onClick={exportCountSheet}>Export count sheet</Button>
            <Button variant="outline" onClick={() => countFileInput.current?.click()}>Review counted CSV</Button>
            <input
              ref={countFileInput}
              type="file"
              accept=".csv,text/csv"
              aria-label="Select counted stock CSV"
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void importCountSheet(file);
              }}
            />
          </>}
          {onAddCategory && <Button variant="outline" onClick={onAddCategory}>+ Category</Button>}
          <Button onClick={onAdd}>+ Add Product</Button>
        </div>
      </div>
      {countSheetError && <p role="alert" className="text-sm text-rose-700">{countSheetError}</p>}
      <p className="text-xs text-slate-500">Export the stock sheet, fill its Counted quantity column, then import it to preview physical variances. This review cannot post stock adjustments.</p>
      {countReview && (
        <section aria-label="Physical count variance review" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-slate-900">Physical count variance review</h3>
          <p className="text-sm text-slate-600">
            Snapshot: {countReview.snapshotAt} · Counted: {countReview.countedCount} / {countReview.productCount}
            {" · "}Not counted: {countReview.uncountedCount}
            {" · "}Differences: {countReview.discrepancies.length}
          </p>
          {countReview.discrepancies.length === 0 ? (
            <p className="text-sm text-slate-600">No variances in counted rows. Uncounted products have not been checked.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-slate-200 text-slate-600">
                  <th className="p-2">Product</th><th className="p-2">System</th>
                  <th className="p-2">Counted</th><th className="p-2">Variance</th>
                  <th className="p-2">Notes</th>
                </tr></thead>
                <tbody>
                  {countReview.discrepancies.slice(0, 30).map((entry) => (
                    <tr key={entry.productId} className="border-b border-slate-100">
                      <td className="p-2">{entry.name} <span className="text-slate-500">({entry.sku})</span></td>
                      <td className="p-2">{entry.bookQuantity} {entry.unit}</td>
                      <td className="p-2">{entry.countedQuantity} {entry.unit}</td>
                      <td className="p-2 font-medium">{entry.varianceQuantity > 0 ? "+" : ""}{entry.varianceQuantity} {entry.unit}</td>
                      <td className="p-2">{entry.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {countReview.discrepancies.length > 30 && (
                <p className="p-2 text-xs text-slate-600">Showing first 30 differences of {countReview.discrepancies.length}.</p>
              )}
            </div>
          )}
          <p className="text-xs text-amber-800">
            Review only. Recheck discrepancies and use the separately authorized Stock adjustment action to post them.
            No quantity, ledger, stock journal or sync record has been changed.
          </p>
        </section>
      )}
      <ProductGs1BarcodeAssistant />
      <DataTable columns={columns} rows={products.filter((product) => !status || (status === "active" ? product.isActive : !product.isActive))} onRowClick={onSelect} emptyMessage="No products found" />
      <Modal
        open={Boolean(archiveTarget)}
        title={archiveTarget ? `Archive product · ${archiveTarget.name}` : "Archive product"}
        onClose={() => { setArchiveTarget(null); setArchiveReason(""); setArchiveError(null); }}
        footer={<>
          <Button variant="outline" onClick={() => { setArchiveTarget(null); setArchiveReason(""); setArchiveError(null); }}>Keep product</Button>
          <Button
            disabled={!archiveTarget || archiveReason.trim().length < 3 || Math.abs(archiveTarget?.stockQuantity ?? 0) > 1e-9}
            onClick={() => {
              if (!archiveTarget || !onArchive) return;
              const result = onArchive(archiveTarget, archiveReason.trim());
              if (result && result.error) { setArchiveError(result.error); return; }
              setArchiveTarget(null); setArchiveReason(""); setArchiveError(null);
            }}
          >
            Archive product
          </Button>
        </>}
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Archived products disappear from normal sales and inventory lists but historical invoices stay intact. Stock must be zero before archive.
          </div>
          {archiveTarget && Math.abs(archiveTarget.stockQuantity) > 1e-9 && <p className="text-sm font-medium text-rose-600">Current stock is {archiveTarget.stockQuantity} {archiveTarget.unit}. Use Stock adjustment to bring it to zero first.</p>}
          <FormField label="Archive reason *">
            <textarea className={inputClass + " h-24 py-2"} value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} />
          </FormField>
          {archiveError && <p className="text-sm text-rose-600">{archiveError}</p>}
        </div>
      </Modal>
    </div>
  );
}
