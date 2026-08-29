"use client";

import * as React from "react";
import type { Sale } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { formatMoney } from "../customers/format";

const statusStyle: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  draft: "bg-slate-100 text-slate-600",
  cancelled: "bg-rose-50 text-rose-700",
  returned: "bg-violet-50 text-violet-700",
};

export function SalesList({
  sales,
  onSelect,
}: {
  sales: Sale[];
  onSelect?: (s: Sale) => void;
}) {
  const columns: Column<Sale>[] = [
    {
      key: "invoiceNumber",
      header: "Invoice",
      render: (r) => <span className="font-medium text-slate-900">{r.invoiceNumber}</span>,
    },
    {
      key: "customerName",
      header: "Customer",
      render: (r) => r.customerName || "Walk-in",
    },
    {
      key: "total",
      header: "Total",
      render: (r) => formatMoney(r.total),
    },
    {
      key: "paidAmount",
      header: "Paid",
      render: (r) => formatMoney(r.paidAmount),
    },
    {
      key: "balanceAmount",
      header: "Balance",
      render: (r) => (
        <span className={r.balanceAmount > 0 ? "text-rose-600" : "text-slate-500"}>
          {formatMoney(r.balanceAmount)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[r.status] ?? ""}`}>
          {r.status}
        </span>
      ),
    },
    {
      key: "saleDate",
      header: "Date",
      render: (r) => new Date(r.saleDate).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Sales</h2>
        <p className="text-sm text-slate-500">{sales.length} invoices</p>
      </div>
      <DataTable columns={columns} rows={sales} onRowClick={onSelect} emptyMessage="No sales yet" />
    </div>
  );
}
