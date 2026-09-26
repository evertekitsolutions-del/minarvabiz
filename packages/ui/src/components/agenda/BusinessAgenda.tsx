"use client";

import * as React from "react";
import type { ServiceOrder } from "@minarvabiz/types";
import { Button } from "../Button";

function localDateKey(date = new Date()): string {
  const off = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - off).toISOString().slice(0, 10);
}

function deliveryKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function prettyServiceType(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function BusinessAgenda({
  orders,
  onOpenOrders,
}: {
  orders: ServiceOrder[];
  onOpenOrders?: () => void;
}) {
  const today = localDateKey();
  const [selectedDate, setSelectedDate] = React.useState(today);
  const active = React.useMemo(
    () => orders.filter((order) => !order.deletedAt && order.status !== "cancelled" && order.status !== "delivered"),
    [orders]
  );

  const withDates = React.useMemo(
    () => active
      .map((order) => ({ order, date: deliveryKey(order.deliveryDate) }))
      .filter((entry): entry is { order: ServiceOrder; date: string } => Boolean(entry.date))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [active]
  );

  const selected = withDates.filter((entry) => entry.date === selectedDate);
  const overdue = withDates.filter((entry) => entry.date < today);
  const dueToday = withDates.filter((entry) => entry.date === today);
  const next7End = localDateKey(new Date(Date.now() + 7 * 86400000));
  const next7 = withDates.filter((entry) => entry.date > today && entry.date <= next7End);
  const ready = active.filter((order) => order.status === "ready_to_deliver");

  const renderRows = (rows: Array<{ order: ServiceOrder; date: string }>) => (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {rows.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-400">No scheduled deliveries in this view.</div>}
      {rows.map(({ order, date }) => (
        <div key={order.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="font-semibold text-slate-900">{order.orderNumber} · {order.customerName || "Customer"}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {prettyServiceType(order.serviceType)} · {order.status.replaceAll("_", " ")}
            </div>
          </div>
          <div className="shrink-0 text-sm font-medium text-slate-700">
            {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Business Agenda</h2>
          <p className="text-sm text-slate-500">Service delivery calendar, overdue work and upcoming commitments.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-slate-600">
            Agenda date
            <input
              type="date"
              className="mt-1 block h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value || today)}
            />
          </label>
          {onOpenOrders && <Button variant="outline" onClick={onOpenOrders}>Open Service Orders</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3"><div className="text-xs font-medium text-rose-700">Overdue</div><div className="mt-1 text-2xl font-bold text-rose-800">{overdue.length}</div></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="text-xs font-medium text-amber-700">Due today</div><div className="mt-1 text-2xl font-bold text-amber-800">{dueToday.length}</div></div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3"><div className="text-xs font-medium text-blue-700">Next 7 days</div><div className="mt-1 text-2xl font-bold text-blue-800">{next7.length}</div></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div className="text-xs font-medium text-emerald-700">Ready to deliver</div><div className="mt-1 text-2xl font-bold text-emerald-800">{ready.length}</div></div>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">
          {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        </h3>
        {renderRows(selected)}
      </section>

      {overdue.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-rose-700">Overdue commitments</h3>
          {renderRows(overdue)}
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">Next 7 days</h3>
        {renderRows(next7)}
      </section>
    </div>
  );
}
