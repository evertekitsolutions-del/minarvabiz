"use client";

import * as React from "react";
import type { LaundryOrder } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { formatMoney } from "../customers/format";

export function LaundryList({
  orders,
  onAddOutsourced,
  onAddIroning,
  onSearch,
  onSelect,
}: {
  orders: LaundryOrder[];
  onAddOutsourced?: () => void;
  onAddIroning?: () => void;
  onSearch?: (q: string) => void;
  onSelect?: (o: LaundryOrder) => void;
}) {
  const [q, setQ] = React.useState("");
  const columns: Column<LaundryOrder>[] = [
    {
      key: "orderNumber",
      header: "Order",
      render: (r) => <span className="font-medium">{r.orderNumber}</span>,
    },
    { key: "customerName", header: "Customer", render: (r) => r.customerName || "—" },
    {
      key: "mode",
      header: "Mode",
      render: (r) => (
        <span className={r.mode === "outsourced" ? "text-violet-700" : "text-cyan-700"}>
          {r.mode === "outsourced" ? "Outsourced" : "In-house ironing"}
        </span>
      ),
    },
    { key: "garment", header: "Garment", render: (r) => r.garment || "—" },
    { key: "quantity", header: "Qty" },
    {
      key: "totalCustomerCharge",
      header: "Customer",
      render: (r) => formatMoney(r.totalCustomerCharge),
    },
    {
      key: "profit",
      header: "Profit",
      render: (r) => (
        <span className="font-medium text-emerald-600">{formatMoney(r.profit)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize">{r.status}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Laundry & Ironing</h2>
          <p className="text-sm text-slate-500">{orders.length} tickets</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            placeholder="Search…"
            value={q}
            onChange={(e) => { setQ(e.target.value); onSearch?.(e.target.value); }}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm sm:w-48 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <Button variant="outline" onClick={onAddIroning}>+ In-house Ironing</Button>
          <Button onClick={onAddOutsourced}>+ Outsourced Laundry</Button>
        </div>
      </div>
      <DataTable columns={columns} rows={orders} onRowClick={onSelect} emptyMessage="No laundry tickets yet" />
    </div>
  );
}
