"use client";

import * as React from "react";
import type { Supplier } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { formatMoney } from "../customers/format";
import { hasPayableSupplierBalance } from "./supplier-payables-filter";

export function SupplierList({
  suppliers,
  onAdd,
  onSearch,
  onPay,
  onSetOpeningBalance,
  onEdit,
  onArchive,
}: {
  suppliers: Supplier[];
  onAdd?: () => void;
  onSearch?: (q: string) => void;
  onPay?: (supplier: Supplier) => void;
  onSetOpeningBalance?: (supplier: Supplier) => void;
  onEdit?: (supplier: Supplier) => void;
  onArchive?: (supplier: Supplier) => void;
}) {
  const [q, setQ] = React.useState("");
  const [withPayablesOnly, setWithPayablesOnly] = React.useState(false);
  const visibleSuppliers = React.useMemo(
    () => withPayablesOnly ? suppliers.filter(hasPayableSupplierBalance) : suppliers,
    [suppliers, withPayablesOnly],
  );
  const columns: Column<Supplier>[] = [
    {
      key: "name",
      header: "Name",
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.name}</div>
          {r.company && <div className="text-xs text-slate-500">{r.company}</div>}
        </div>
      ),
    },
    { key: "phone", header: "Phone", render: (r) => r.phone || "—" },
    { key: "category", header: "Category", render: (r) => r.category || "—" },
    {
      key: "outstandingBalance",
      header: "Outstanding",
      render: (r) => (
        <span className={r.outstandingBalance > 0 ? "font-medium text-rose-600" : "text-slate-500"}>
          {formatMoney(r.outstandingBalance)}
        </span>
      ),
    },
    {
      key: "id",
      header: "Actions",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {onPay && <Button size="sm" variant="outline" disabled={!hasPayableSupplierBalance(r)} onClick={() => onPay(r)}>Record Payment</Button>}
          {onSetOpeningBalance && <Button size="sm" variant="outline" onClick={() => onSetOpeningBalance(r)}>Opening payable</Button>}
          {onEdit && <Button size="sm" variant="outline" onClick={() => onEdit(r)}>Edit</Button>}
          {onArchive && <Button size="sm" variant="outline" onClick={() => onArchive(r)}>Archive</Button>}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Suppliers</h2>
          <p role="status" className="text-sm text-slate-500">{visibleSuppliers.length} of {suppliers.length} suppliers</p>
        </div>
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Search…"
            value={q}
            onChange={(e) => { setQ(e.target.value); onSearch?.(e.target.value); }}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm sm:w-48 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          {onAdd && <Button onClick={onAdd}>+ Add Supplier</Button>}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="size-4 accent-indigo-600" checked={withPayablesOnly} onChange={(event) => setWithPayablesOnly(event.target.checked)} />
          Outstanding payables only
        </label>
        <Button size="sm" variant="outline" onClick={() => { setQ(""); setWithPayablesOnly(false); onSearch?.(""); }}>Clear filters</Button>
      </div>
      <DataTable columns={columns} rows={visibleSuppliers} emptyMessage={withPayablesOnly ? "No suppliers with outstanding payables match this search" : "No suppliers match this search"} />
    </div>
  );
}
