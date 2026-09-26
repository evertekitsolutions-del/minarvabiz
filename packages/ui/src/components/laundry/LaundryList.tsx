"use client";

import * as React from "react";
import type { AuditLogEntry, LaundryOrder } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { formatMoney } from "../customers/format";
import { Modal } from "../forms/Modal";
import { FormField, inputClass, selectClass } from "../forms/FormField";

type LaundryEditResult = { success: boolean; error?: string; order?: LaundryOrder };

function dateKey(value: string) {
  return String(value || "").slice(0, 10);
}

function actionLabel(action: string) {
  return action.replace(/^laundry\./, "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function LaundryList({
  orders,
  auditLogs = [],
  onAddOutsourced,
  onAddIroning,
  onCreate,
  onSearch,
  onSelect,
  onStatusChange,
  onCancel,
  onUpdateDetails,
}: {
  orders: LaundryOrder[];
  auditLogs?: AuditLogEntry[];
  onAddOutsourced?: () => void;
  onAddIroning?: () => void;
  onCreate?: (mode: "outsourced" | "in_house_ironing") => void;
  onSearch?: (q: string) => void;
  onSelect?: (o: LaundryOrder) => void;
  onStatusChange?: (order: LaundryOrder, status: LaundryOrder["status"]) => void;
  onCancel?: (order: LaundryOrder) => void;
  onUpdateDetails?: (order: LaundryOrder, values: { garment: string; notes: string }) => LaundryEditResult;
}) {
  const [q, setQ] = React.useState("");
  const [customerId, setCustomerId] = React.useState("");
  const [mode, setMode] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [supplierId, setSupplierId] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [detailTarget, setDetailTarget] = React.useState<LaundryOrder | null>(null);
  const [editTarget, setEditTarget] = React.useState<LaundryOrder | null>(null);
  const [editGarment, setEditGarment] = React.useState("");
  const [editNotes, setEditNotes] = React.useState("");
  const [editError, setEditError] = React.useState<string | null>(null);

  const customerOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((order) => { if (order.customerId) map.set(order.customerId, order.customerName || order.customerId); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);
  const supplierOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((order) => { if (order.supplierId) map.set(order.supplierId, order.supplierName || order.supplierId); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);

  const filtered = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    return orders.filter((order) => {
      if (customerId && order.customerId !== customerId) return false;
      if (mode && order.mode !== mode) return false;
      if (status && order.status !== status) return false;
      if (supplierId === "__none" && order.supplierId) return false;
      if (supplierId && supplierId !== "__none" && order.supplierId !== supplierId) return false;
      const created = dateKey(order.createdAt);
      if (dateFrom && created < dateFrom) return false;
      if (dateTo && created > dateTo) return false;
      if (!query) return true;
      return [
        order.orderNumber,
        order.customerName || "",
        order.garment || "",
        order.supplierName || "",
        order.notes || "",
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [orders, q, customerId, mode, status, supplierId, dateFrom, dateTo]);

  const clearFilters = () => {
    setQ("");
    setCustomerId("");
    setMode("");
    setStatus("");
    setSupplierId("");
    setDateFrom("");
    setDateTo("");
    onSearch?.("");
  };

  const openDetails = (order: LaundryOrder) => {
    setDetailTarget(order);
    onSelect?.(order);
  };

  const openEdit = (order: LaundryOrder) => {
    setEditTarget(order);
    setEditGarment(order.garment || "");
    setEditNotes(order.notes || "");
    setEditError(null);
  };

  const saveEdit = () => {
    if (!editTarget || !onUpdateDetails) return;
    const result = onUpdateDetails(editTarget, { garment: editGarment, notes: editNotes });
    if (!result.success) {
      setEditError(result.error || "Unable to update laundry ticket");
      return;
    }
    if (result.order) setDetailTarget(result.order);
    setEditTarget(null);
    setEditError(null);
  };

  const columns: Column<LaundryOrder>[] = [
    { key: "orderNumber", header: "Order", render: (r) => <span className="font-medium">{r.orderNumber}</span> },
    { key: "customerName", header: "Customer", render: (r) => r.customerName || "—" },
    { key: "mode", header: "Mode", render: (r) => <span className={r.mode === "outsourced" ? "text-violet-700" : "text-cyan-700"}>{r.mode === "outsourced" ? "Outsourced" : "In-house ironing"}</span> },
    { key: "garment", header: "Garment", render: (r) => r.garment || "—" },
    { key: "quantity", header: "Qty" },
    { key: "totalCustomerCharge", header: "Customer", render: (r) => formatMoney(r.totalCustomerCharge) },
    { key: "profit", header: "Profit", render: (r) => <span className="font-medium text-emerald-600">{formatMoney(r.profit)}</span> },
    { key: "status", header: "Status", render: (r) => <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize">{r.status.replaceAll("_", " ")}</span> },
    {
      key: "action",
      header: "Actions",
      render: (r) => {
        const next = r.mode === "outsourced" && r.status !== "cancelled"
          ? (r.status === "pending" ? "sent" : r.status === "sent" ? "received" : r.status === "received" ? "delivered" : null)
          : null;
        const label = next === "sent" ? "Mark Sent" : next === "received" ? "Mark Received" : next === "delivered" ? "Mark Delivered" : null;
        return (
          <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="outline" onClick={() => openDetails(r)}>Details</Button>
            {r.status !== "cancelled" && onUpdateDetails && <Button size="sm" variant="outline" onClick={() => openEdit(r)}>Edit Details</Button>}
            {label && onStatusChange && <Button size="sm" variant="outline" onClick={() => onStatusChange(r, next!)}>{label}</Button>}
            {r.status !== "cancelled" && onCancel && <Button size="sm" variant="danger" onClick={() => onCancel(r)}>Cancel Ticket</Button>}
          </div>
        );
      },
    },
  ];

  const ironing = onAddIroning ?? (() => onCreate?.("in_house_ironing"));
  const outsourced = onAddOutsourced ?? (() => onCreate?.("outsourced"));
  const detailHistory = detailTarget
    ? auditLogs.filter((entry) => entry.tableName === "laundry_orders" && entry.recordId === detailTarget.id)
    : [];

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Laundry & Ironing</h2>
            <p className="text-sm text-slate-500">{filtered.length} of {orders.length} tickets</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
            <Button variant="outline" onClick={ironing}>+ In-house Ironing</Button>
            <Button onClick={outsourced}>+ Outsourced Laundry</Button>
          </div>
        </div>

        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-7">
          <label className="text-xs font-medium text-slate-600 lg:col-span-2">
            Search ticket, customer, garment or supplier
            <input
              type="search"
              placeholder="Search…"
              value={q}
              onChange={(e) => { setQ(e.target.value); onSearch?.(e.target.value); }}
              className={inputClass + " mt-1"}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Customer
            <select className={selectClass + " mt-1"} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">All customers</option>
              {customerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Mode
            <select className={selectClass + " mt-1"} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="">All modes</option>
              <option value="outsourced">Outsourced</option>
              <option value="in_house_ironing">In-house ironing</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Status
            <select className={selectClass + " mt-1"} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {["pending", "sent", "received", "delivered", "cancelled"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Supplier
            <select className={selectClass + " mt-1"} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">All suppliers</option>
              <option value="__none">No supplier / in-house</option>
              {supplierOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-slate-600">
              From
              <input type="date" className={inputClass + " mt-1"} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="text-xs font-medium text-slate-600">
              To
              <input type="date" className={inputClass + " mt-1"} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
          </div>
        </div>

        <DataTable columns={columns} rows={filtered} onRowClick={openDetails} emptyMessage="No laundry tickets match the selected filters" />
      </div>

      <Modal
        open={Boolean(detailTarget)}
        title={detailTarget ? `Laundry ticket ${detailTarget.orderNumber}` : "Laundry ticket details"}
        onClose={() => setDetailTarget(null)}
        className="max-w-3xl"
        footer={detailTarget ? <>
          <Button variant="outline" onClick={() => setDetailTarget(null)}>Close</Button>
          {detailTarget.status !== "cancelled" && onUpdateDetails && <Button variant="outline" onClick={() => openEdit(detailTarget)}>Edit Details</Button>}
          {detailTarget.status !== "cancelled" && onCancel && <Button variant="danger" onClick={() => { onCancel(detailTarget); setDetailTarget(null); }}>Cancel Ticket</Button>}
        </> : undefined}
      >
        {detailTarget && (
          <div className="space-y-5 text-sm">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-blue-800">
              Financial values are posted at ticket creation and stay immutable. Use cancellation/refund for accounting-safe financial corrections.
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><div className="text-xs text-slate-500">Customer</div><div className="font-medium text-slate-900">{detailTarget.customerName || "—"}</div></div>
              <div><div className="text-xs text-slate-500">Mode</div><div className="font-medium text-slate-900">{detailTarget.mode === "outsourced" ? "Outsourced" : "In-house ironing"}</div></div>
              <div><div className="text-xs text-slate-500">Status</div><div className="font-medium capitalize text-slate-900">{detailTarget.status.replaceAll("_", " ")}</div></div>
              <div><div className="text-xs text-slate-500">Created</div><div className="font-medium text-slate-900">{new Date(detailTarget.createdAt).toLocaleString("en-IN")}</div></div>
              <div><div className="text-xs text-slate-500">Garment</div><div className="font-medium text-slate-900">{detailTarget.garment || "—"}</div></div>
              <div><div className="text-xs text-slate-500">Quantity</div><div className="font-medium text-slate-900">{detailTarget.quantity}</div></div>
              <div><div className="text-xs text-slate-500">Supplier</div><div className="font-medium text-slate-900">{detailTarget.supplierName || "—"}</div></div>
              <div><div className="text-xs text-slate-500">Last updated</div><div className="font-medium text-slate-900">{new Date(detailTarget.updatedAt).toLocaleString("en-IN")}</div></div>
            </div>
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-5">
              <div><div className="text-xs text-slate-500">Customer rate</div><div className="font-semibold">{formatMoney(detailTarget.customerRate)}</div></div>
              <div><div className="text-xs text-slate-500">Supplier rate</div><div className="font-semibold">{formatMoney(detailTarget.supplierRate)}</div></div>
              <div><div className="text-xs text-slate-500">Paid</div><div className="font-semibold">{formatMoney(detailTarget.paidAmount)}</div></div>
              <div><div className="text-xs text-slate-500">Balance</div><div className="font-semibold">{formatMoney(detailTarget.balanceAmount)}</div></div>
              <div><div className="text-xs text-slate-500">Profit</div><div className="font-semibold text-emerald-700">{formatMoney(detailTarget.profit)}</div></div>
            </div>
            {detailTarget.notes && <div><div className="text-xs text-slate-500">Notes</div><div className="mt-1 whitespace-pre-wrap text-slate-700">{detailTarget.notes}</div></div>}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Ticket history</h3>
              <div className="space-y-2">
                {detailHistory.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-slate-400">No audit events available for this ticket yet.</div>}
                {detailHistory.map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-1 rounded-lg border border-slate-200 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div><span className="font-medium text-slate-800">{actionLabel(entry.action)}</span><span className="ml-2 text-xs text-slate-500">by {entry.userName || "System"}</span></div>
                    <div className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString("en-IN")}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(editTarget)}
        title={editTarget ? `Edit details — ${editTarget.orderNumber}` : "Edit laundry details"}
        onClose={() => { setEditTarget(null); setEditError(null); }}
        footer={<>
          <Button variant="outline" onClick={() => { setEditTarget(null); setEditError(null); }}>Cancel</Button>
          <Button onClick={saveEdit}>Save Details</Button>
        </>}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Only non-financial ticket details can be edited. Quantity, rates, supplier cost, payments and balances remain immutable after posting.
          </div>
          <FormField label="Garment / item">
            <input className={inputClass} value={editGarment} onChange={(e) => setEditGarment(e.target.value)} />
          </FormField>
          <FormField label="Notes">
            <textarea className={inputClass + " h-24 py-2"} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
          </FormField>
          {editError && <p role="alert" className="text-sm text-rose-600">{editError}</p>}
        </div>
      </Modal>
    </>
  );
}
