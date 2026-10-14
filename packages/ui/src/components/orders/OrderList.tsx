"use client";

import * as React from "react";
import type { ServiceOrder, ServiceType, OrderStatus, Customer } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { formatMoney } from "../customers/format";
import { inputClass, selectClass } from "../forms/FormField";
import { SERVICE_TYPE_LABELS, ORDER_STATUS_LABELS, exportServiceOrdersCsv } from "@minarvabiz/business-logic";
import { isOverdueServiceOrder, localBusinessDate } from "./order-overdue-filter";

const statusStyle: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  processing: "bg-blue-50 text-blue-700 ring-blue-200",
  ready_to_deliver: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  delivered: "bg-slate-100 text-slate-600 ring-slate-200",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function OrderList({
  orders,
  customers = [],
  onAdd,
  onCreate,
  onSearch,
  onFilterStatus,
  onFilterType,
  onFilterCustomer,
  onFilterOrderDateFrom,
  onFilterOrderDateTo,
  onFilterDeliveryDateFrom,
  onFilterDeliveryDateTo,
  onSelect,
}: {
  orders: ServiceOrder[];
  customers?: Customer[];
  onAdd?: () => void;
  onCreate?: () => void;
  onSearch?: (q: string) => void;
  onFilterStatus?: (s: OrderStatus | null) => void;
  onFilterType?: (t: ServiceType | null) => void;
  onFilterCustomer?: (customerId: string | null) => void;
  onFilterOrderDateFrom?: (date: string) => void;
  onFilterOrderDateTo?: (date: string) => void;
  onFilterDeliveryDateFrom?: (date: string) => void;
  onFilterDeliveryDateTo?: (date: string) => void;
  onSelect?: (o: ServiceOrder) => void;
}) {
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [type, setType] = React.useState("");
  const [customerId, setCustomerId] = React.useState("");
  const [orderDateFrom, setOrderDateFrom] = React.useState("");
  const [orderDateTo, setOrderDateTo] = React.useState("");
  const [deliveryDateFrom, setDeliveryDateFrom] = React.useState("");
  const [deliveryDateTo, setDeliveryDateTo] = React.useState("");
  const [overdueOnly, setOverdueOnly] = React.useState(false);
  const [exportFeedback, setExportFeedback] = React.useState<{ error: boolean; text: string } | null>(null);
  const businessDay = localBusinessDate();
  const visibleOrders = React.useMemo(
    () => overdueOnly ? orders.filter((order) => isOverdueServiceOrder(order, businessDay)) : orders,
    [orders, overdueOnly, businessDay],
  );

  const clearFilters = () => {
    setQ("");
    setStatus("");
    setType("");
    setCustomerId("");
    setOrderDateFrom("");
    setOrderDateTo("");
    setDeliveryDateFrom("");
    setDeliveryDateTo("");
    setOverdueOnly(false);
    onSearch?.("");
    onFilterStatus?.(null);
    onFilterType?.(null);
    onFilterCustomer?.(null);
    onFilterOrderDateFrom?.("");
    onFilterOrderDateTo?.("");
    onFilterDeliveryDateFrom?.("");
    onFilterDeliveryDateTo?.("");
  };

  function downloadVisibleOrdersCsv() {
    if (visibleOrders.length === 0) return;
    try {
      const csv = exportServiceOrdersCsv(visibleOrders);
      const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff), csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "minarvabiz-service-orders-" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(link);
      try {
        link.click();
        setExportFeedback({ error: false, text: "Export requested for " + visibleOrders.length + " displayed service order(s)." });
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      setExportFeedback({
        error: true,
        text: error instanceof Error ? "Service orders CSV export failed: " + error.message : "Service orders CSV export failed.",
      });
    }
  }

  const columns: Column<ServiceOrder>[] = [
    { key: "actions", header: "Actions", render: (order) => onSelect ? (
      <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); onSelect(order); }}>
        {order.status === "delivered" || order.status === "cancelled" ? "Details" : "Edit / Cancel"}
      </Button>
    ) : null },
    { key: "orderNumber", header: "Order No.", render: (r) => <span className="font-medium text-slate-900">{r.orderNumber}</span> },
    { key: "customerName", header: "Customer", render: (r) => r.customerName || "—" },
    { key: "serviceType", header: "Type", render: (r) => SERVICE_TYPE_LABELS[r.serviceType] ?? r.serviceType },
    { key: "status", header: "Status", render: (r) => <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyle[r.status] ?? "bg-slate-50 text-slate-600 ring-slate-200"}`}>{ORDER_STATUS_LABELS[r.status]}</span> },
    { key: "price", header: "Price", render: (r) => formatMoney(r.price) },
    { key: "balance", header: "Balance", render: (r) => <span className={r.balance > 0 ? "text-rose-600 font-medium" : "text-slate-500"}>{formatMoney(r.balance)}</span> },
    { key: "deliveryDate", header: "Delivery", render: (r) => r.deliveryDate ? new Date(r.deliveryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Services & Orders</h2>
          <p role="status" className="text-sm text-slate-500">{visibleOrders.length} of {orders.length} matching orders</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={visibleOrders.length === 0} onClick={downloadVisibleOrdersCsv}>Export filtered CSV</Button>
          <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
          <Button onClick={onAdd ?? onCreate}>+ New Order</Button>
        </div>
      </div>

      {exportFeedback && <p role={exportFeedback.error ? "alert" : "status"} className={`text-sm ${exportFeedback.error ? "text-rose-700" : "text-slate-600"}`}>{exportFeedback.text}</p>}
      <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="size-4 accent-indigo-600" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} />Overdue deliveries only</label>
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-xs font-medium text-slate-600 lg:col-span-2">
          Search order, customer or notes
          <input
            type="search"
            className={inputClass + " mt-1"}
            placeholder="Search…"
            value={q}
            onChange={(e) => { setQ(e.target.value); onSearch?.(e.target.value); }}
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Customer
          <select className={selectClass + " mt-1"} value={customerId} onChange={(e) => { setCustomerId(e.target.value); onFilterCustomer?.(e.target.value || null); }}>
            <option value="">All customers</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Status
          <select className={selectClass + " mt-1"} value={status} onChange={(e) => { setStatus(e.target.value); onFilterStatus?.((e.target.value || null) as OrderStatus | null); }}>
            <option value="">All statuses</option>
            {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((value) => <option key={value} value={value}>{ORDER_STATUS_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Service type
          <select className={selectClass + " mt-1"} value={type} onChange={(e) => { setType(e.target.value); onFilterType?.((e.target.value || null) as ServiceType | null); }}>
            <option value="">All types</option>
            {(Object.keys(SERVICE_TYPE_LABELS) as ServiceType[]).map((value) => <option key={value} value={value}>{SERVICE_TYPE_LABELS[value]}</option>)}
          </select>
        </label>
        <div className="hidden lg:block" />

        <div className="grid grid-cols-2 gap-2 lg:col-span-2">
          <label className="text-xs font-medium text-slate-600">
            Order from
            <input type="date" className={inputClass + " mt-1"} value={orderDateFrom} onChange={(e) => { setOrderDateFrom(e.target.value); onFilterOrderDateFrom?.(e.target.value); }} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Order to
            <input type="date" className={inputClass + " mt-1"} value={orderDateTo} onChange={(e) => { setOrderDateTo(e.target.value); onFilterOrderDateTo?.(e.target.value); }} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:col-span-2">
          <label className="text-xs font-medium text-slate-600">
            Delivery from
            <input type="date" className={inputClass + " mt-1"} value={deliveryDateFrom} onChange={(e) => { setDeliveryDateFrom(e.target.value); onFilterDeliveryDateFrom?.(e.target.value); }} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Delivery to
            <input type="date" className={inputClass + " mt-1"} value={deliveryDateTo} onChange={(e) => { setDeliveryDateTo(e.target.value); onFilterDeliveryDateTo?.(e.target.value); }} />
          </label>
        </div>
      </div>

      <DataTable columns={columns} rows={visibleOrders} onRowClick={onSelect} emptyMessage={overdueOnly ? "No overdue orders match the selected filters" : "No orders match the selected filters"} />
    </div>
  );
}
