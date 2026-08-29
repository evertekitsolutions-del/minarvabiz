"use client";

import * as React from "react";
import type { Product, Category } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { formatMoney } from "../customers/format";

export function ProductList({
  products,
  categories,
  onAdd,
  onSearch,
  onFilterCategory,
  onSelect,
  lowStockOnly,
  onToggleLowStock,
}: {
  products: Product[];
  categories: Category[];
  onAdd?: () => void;
  onSearch?: (q: string) => void;
  onFilterCategory?: (id: string | null) => void;
  onSelect?: (p: Product) => void;
  lowStockOnly?: boolean;
  onToggleLowStock?: () => void;
}) {
  const [q, setQ] = React.useState("");
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
  ];

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
          <Button variant={lowStockOnly ? "primary" : "outline"} onClick={onToggleLowStock}>
            Low stock
          </Button>
          <Button onClick={onAdd}>+ Add Product</Button>
        </div>
      </div>
      <DataTable columns={columns} rows={products} onRowClick={onSelect} emptyMessage="No products found" />
    </div>
  );
}
