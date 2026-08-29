"use client";

import * as React from "react";
import type { Supplier } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { formatMoney } from "../customers/format";

export function SupplierList({
  suppliers,
  onAdd,
  onSearch,
}: {
  suppliers: Supplier[];
  onAdd?: () => void;
  onSearch?: (q: string) => void;
}) {
  const [q, setQ] = React.useState("");
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
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Suppliers</h2>
          <p className="text-sm text-slate-500">{suppliers.length} suppliers</p>
        </div>
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Search…"
            value={q}
            onChange={(e) => { setQ(e.target.value); onSearch?.(e.target.value); }}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm sm:w-48 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <Button onClick={onAdd}>+ Add Supplier</Button>
        </div>
      </div>
      <DataTable columns={columns} rows={suppliers} emptyMessage="No suppliers yet" />
    </div>
  );
}
