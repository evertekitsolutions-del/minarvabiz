"use client";

import * as React from "react";
import type { ServiceOrder, ServiceType, OrderStatus, Customer, StaffMember, StaffAssignment } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { ServiceWarrantyPanel } from "./ServiceWarrantyPanel";
import { Button } from "../Button";
import { formatMoney } from "../customers/format";
import { inputClass, selectClass } from "../forms/FormField";
import { SERVICE_TYPE_LABELS, ORDER_STATUS_LABELS, exportServiceOrdersCsv, planAmcVisits, type AmcVisitPlan } from "@minarvabiz/business-logic";
import { isOverdueServiceOrder, localBusinessDate } from "./order-overdue-filter";
import { filterServiceOrdersByAssignedStaff, assignedStaffNamesForOrder } from "./order-assignment-filter";

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
  staffMembers = [],
  staffAssignments = [],
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
  staffMembers?: StaffMember[];
  staffAssignments?: StaffAssignment[];
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
  const [assignedStaffFilter, setAssignedStaffFilter] = React.useState("");
  const [exportFeedback, setExportFeedback] = React.useState<{ error: boolean; text: string } | null>(null);
  const [amcCustomerId, setAmcCustomerId] = React.useState("");
  const [amcReference, setAmcReference] = React.useState("");
  const [amcStartDate, setAmcStartDate] = React.useState("");
  const [amcEndDate, setAmcEndDate] = React.useState("");
  const [amcInterval, setAmcInterval] = React.useState<1 | 2 | 3 | 6 | 12>(3);
  const [amcNotes, setAmcNotes] = React.useState("");
  const [amcPlan, setAmcPlan] = React.useState<AmcVisitPlan | null>(null);
  const [amcError, setAmcError] = React.useState<string | null>(null);
  const businessDay = localBusinessDate();
  const visibleOrders = React.useMemo(() => {
    const dateFiltered = overdueOnly ? orders.filter((order) => isOverdueServiceOrder(order, businessDay)) : orders;
    return filterServiceOrdersByAssignedStaff(dateFiltered, staffAssignments, assignedStaffFilter);
  }, [orders, overdueOnly, businessDay, staffAssignments, assignedStaffFilter]);
  const staffOptions = React.useMemo(() => {
    const names = new Map(staffMembers.map((member) => [member.id, member.name]));
    for (const assignment of staffAssignments) {
      if (assignment.status !== "cancelled" && !names.has(assignment.staffId)) {
        names.set(assignment.staffId, assignment.staffName?.trim() || assignment.staffId);
      }
    }
    return [...names].sort((a, b) => a[1].localeCompare(b[1]));
  }, [staffMembers, staffAssignments]);

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
    setAssignedStaffFilter("");
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

  function previewAmcPlan() {
    setAmcError(null);
    setAmcPlan(null);
    try {
      const selected = customers.find(customer => customer.id === amcCustomerId && !customer.deletedAt);
      if (!selected) throw new Error("Select a customer before planning AMC visits");
      setAmcPlan(planAmcVisits({
        customerId: selected.id,
        customerName: selected.name,
        contractReference: amcReference,
        startDate: amcStartDate,
        endDate: amcEndDate,
        intervalMonths: amcInterval,
        notes: amcNotes,
      }));
    } catch (error) {
      setAmcError(error instanceof Error ? error.message : "Unable to plan AMC visits");
    }
  }

  function downloadAmcPlan() {
    if (!amcPlan) return;
    try {
      const url = URL.createObjectURL(new Blob(["\uFEFF", amcPlan.csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "minarvabiz-amc-visits-" + amcPlan.startDate + ".csv";
      document.body.appendChild(link);
      try { link.click(); }
      finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      setAmcError(error instanceof Error ? error.message : "AMC CSV export failed");
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
    { key: "assignedStaff", header: "Assigned staff", render: (r) =>
      assignedStaffNamesForOrder(r, staffAssignments, staffMembers).join(", ") || "Unassigned" },
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
      <details className="rounded-xl border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">Plan AMC visits</summary>
        <p className="mt-2 text-xs text-slate-600">Schedule-only preview for an annual maintenance contract. No contract, job, notification or customer record is saved.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-medium text-slate-600">Contract customer
            <select aria-label="AMC customer" className={selectClass + " mt-1"} value={amcCustomerId} onChange={e => { setAmcCustomerId(e.target.value); setAmcPlan(null); }}>
              <option value="">Select customer</option>
              {customers.filter(c => !c.deletedAt).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">Contract reference
            <input aria-label="AMC contract reference" className={inputClass + " mt-1"} value={amcReference} maxLength={128}
              onChange={e => { setAmcReference(e.target.value); setAmcPlan(null); }} placeholder="AMC-2026-001" />
          </label>
          <label className="text-xs font-medium text-slate-600">Start date
            <input aria-label="AMC start date" type="date" className={inputClass + " mt-1"} value={amcStartDate}
              onChange={e => { setAmcStartDate(e.target.value); setAmcPlan(null); }} />
          </label>
          <label className="text-xs font-medium text-slate-600">End date
            <input aria-label="AMC end date" type="date" className={inputClass + " mt-1"} value={amcEndDate}
              onChange={e => { setAmcEndDate(e.target.value); setAmcPlan(null); }} />
          </label>
          <label className="text-xs font-medium text-slate-600">Visit interval
            <select aria-label="AMC visit interval" className={selectClass + " mt-1"} value={amcInterval}
              onChange={e => { setAmcInterval(Number(e.target.value) as 1 | 2 | 3 | 6 | 12); setAmcPlan(null); }}>
              {[1, 2, 3, 6, 12].map(months => <option key={months} value={months}>{months} month{months === 1 ? "" : "s"}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600 sm:col-span-2 lg:col-span-3">Visit checklist / notes
            <input aria-label="AMC visit notes" className={inputClass + " mt-1"} maxLength={2000} value={amcNotes}
              onChange={e => { setAmcNotes(e.target.value); setAmcPlan(null); }} placeholder="Inspect cameras, cabling, NVR and UPS" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={previewAmcPlan}>Preview AMC schedule</Button>
          {amcPlan && <Button variant="outline" size="sm" onClick={downloadAmcPlan}>Export AMC schedule CSV</Button>}
        </div>
        {amcError && <p className="mt-2 text-sm text-rose-700" role="alert">{amcError}</p>}
        {amcPlan && (
          <div className="mt-3">
            <p role="status" className="text-sm font-medium text-slate-800">
              {amcPlan.visits.length} planned visits for {amcPlan.customerName}; first {amcPlan.visits[0]?.visitDate}, last {amcPlan.visits[amcPlan.visits.length - 1]?.visitDate}
            </p>
            <ol className="mt-2 grid list-decimal gap-x-6 gap-y-1 pl-6 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
              {amcPlan.visits.map(visit => <li key={visit.sequence}>{visit.visitDate}</li>)}
            </ol>
          </div>
        )}
      </details>
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
        <label className="text-xs font-medium text-slate-600">
          Assigned staff
          <select aria-label="Filter service orders by assigned staff"
            className={selectClass + " mt-1"} value={assignedStaffFilter}
            onChange={(event) => setAssignedStaffFilter(event.target.value)}>
            <option value="">All staff</option>
            <option value="unassigned">Unassigned orders</option>
            {staffOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>

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

      <DataTable columns={columns} rows={visibleOrders} onRowClick={onSelect} emptyMessage={overdueOnly ? "No overdue orders match the selected filters" : assignedStaffFilter ? "No orders match the assigned staff filter" : "No orders match the selected filters"} />
      <ServiceWarrantyPanel orders={orders} />
    </div>
  );
}
