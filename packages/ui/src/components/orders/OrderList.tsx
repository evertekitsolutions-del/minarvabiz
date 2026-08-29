"use client";

import * as React from "react";
import type { ServiceOrder, ServiceType, OrderStatus } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { formatMoney } from "../customers/format";
import { SERVICE_TYPE_LABELS, ORDER_STATUS_LABELS } from "@minarvabiz/business-logic";

const statusStyle: Record<OrderStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  processing: "bg-blue-50 text-blue-700 ring-blue-200",
  ready_to_deliver: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  delivered: "bg-slate-100 text-slate-600 ring-slate-200",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function OrderList({
  orders,
  onAdd,
  onSearch,
  onFilterStatus,
  onFilterType,
  onSelect,
}: {
  orders: ServiceOrder[];
  onAdd?: () => void;
  onSearch?: (q: string) => void;
  onFilterStatus?: (s: OrderStatus | null) => void;
  onFilterType?: (t: ServiceType | null) => void;
  onSelect?: (o: ServiceOrder) => void;
}) {
  const [q, setQ] = React.useState("");
  const columns: Column<ServiceOrder>[] = [
    {
      key: "orderNumber",
      header: "Order No.",
      render: (r) => <span className="font-medium text-slate-900">{r.orderNumber}</span>,
    },
    {
      key: "customerName",
      header: "Customer",
      render: (r) => r.customerName || "—",
    },
    {
      key: "serviceType",
      header: "Type",
      render: (r) => SERVICE_TYPE_LABELS[r.serviceType] ?? r.serviceType,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyle[r.status]}`}>
          {ORDER_STATUS_LABELS[r.status]}
        </span>
      ),
    },
    {
      key: "price",
      header: "Price",
      render: (r) => formatMoney(r.price),
    },
    {
      key: "balance",
      header: "Balance",
      render: (r) => (
        <span className={r.balance > 0 ? "text-rose-600 font-medium" : "text-slate-500"}>
          {formatMoney(r.balance)}
        </span>
      ),
    },
    {
      key: "deliveryDate",
      header: "Delivery",
      render: (r) =>
        r.deliveryDate
          ? new Date(r.deliveryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
          : "—",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Services & Orders</h2>
          <p className="text-sm text-slate-500">{orders.length} orders</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            placeholder="Search order, customer…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              onSearch?.(e.target.value);
            }}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm sm:w-52 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <select
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
            onChange={(e) => onFilterStatus?.((e.target.value || null) as OrderStatus | null)}
            defaultValue=""
          >
            <option value="">All statuses</option>
            {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((s) => (
              <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <select
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
            onChange={(e) => onFilterType?.((e.target.value || null) as ServiceType | null)}
            defaultValue=""
          >
            <option value="">All types</option>
            {(Object.keys(SERVICE_TYPE_LABELS) as ServiceType[]).map((t) => (
              <option key={t} value={t}>{SERVICE_TYPE_LABELS[t]}</option>
            ))}
          </select>
          <Button onClick={onAdd}>+ New Order</Button>
        </div>
      </div>
      <DataTable columns={columns} rows={orders} onRowClick={onSelect} emptyMessage="No orders yet" />
    </div>
  );
}
