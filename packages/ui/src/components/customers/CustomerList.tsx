"use client";

import * as React from "react";
import type { Customer } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { formatMoney } from "./format";

export function CustomerList({
  customers,
  onAdd,
  onSearch,
  onSelect,
}: {
  customers: Customer[];
  onAdd?: () => void;
  onSearch?: (q: string) => void;
  onSelect?: (c: Customer) => void;
}) {
  const [q, setQ] = React.useState("");
  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: "Name",
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.name}</div>
          {r.phone && <div className="text-xs text-slate-500">{r.phone}</div>}
        </div>
      ),
    },
    { key: "email", header: "Email", render: (r) => r.email || "—" },
    {
      key: "totalSpending",
      header: "Total Spending",
      render: (r) => formatMoney(r.totalSpending),
    },
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
          <h2 className="text-xl font-semibold text-slate-900">Customers</h2>
          <p className="text-sm text-slate-500">{customers.length} customers</p>
        </div>
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Search name, phone, email…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              onSearch?.(e.target.value);
            }}
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm sm:w-64 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <Button onClick={onAdd}>+ Add Customer</Button>
        </div>
      </div>
      <DataTable columns={columns} rows={customers} onRowClick={onSelect} emptyMessage="No customers yet" />
    </div>
  );
}
