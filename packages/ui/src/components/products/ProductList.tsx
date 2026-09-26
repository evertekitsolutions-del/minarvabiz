"use client";

import * as React from "react";
import type { Product, Category } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { formatMoney } from "../customers/format";
import { Modal } from "../forms/Modal";
import { FormField, inputClass, selectClass } from "../forms/FormField";

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
          {onAddCategory && <Button variant="outline" onClick={onAddCategory}>+ Category</Button>}
          <Button onClick={onAdd}>+ Add Product</Button>
        </div>
      </div>
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
