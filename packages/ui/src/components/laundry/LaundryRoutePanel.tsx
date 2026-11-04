"use client";
import * as React from "react";
import type { Customer, LaundryOrder } from "@minarvabiz/types";
import { buildLaundryRouteDraft, type LaundryRouteLeg } from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { LaundryHandoverAction } from "./LaundryHandoverAction";
import { inputClass, selectClass } from "../forms/FormField";

function localToday() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}
export function LaundryRoutePanel({ orders, customers }: {
  orders: readonly LaundryOrder[];
  customers: readonly Pick<Customer, "id" | "name" | "address" | "branchId" | "deletedAt">[];
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [day, setDay] = React.useState(localToday);
  const [leg, setLeg] = React.useState<LaundryRouteLeg>("pickup");
  const draft = React.useMemo(() => buildLaundryRouteDraft(orders, customers, day, leg),
    [orders, customers, day, leg]);
  return <section className="rounded-xl border border-slate-200 bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-sm font-semibold text-slate-900">Laundry pickup & drop route worksheet</h3>
        <p className="text-xs text-slate-500">Local planned stops · No route optimization, GPS tracking or courier API · Manual device-local acknowledgment</p></div>
      <Button variant="outline" size="sm" onClick={() => setExpanded(open => !open)}>{expanded ? "Hide route" : "Plan route"}</Button>
    </div>
    {expanded && <div className="mt-3 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-medium">Scheduled day
          <input className={inputClass+" mt-1"} type="date" value={day} onChange={event => setDay(event.target.value || localToday())} />
        </label>
        <label className="text-xs font-medium">Route
          <select className={selectClass+" mt-1"} value={leg} onChange={event => setLeg(event.target.value as LaundryRouteLeg)}>
            <option value="pickup">Pickup bookings</option><option value="dropoff">QC-ready delivery</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-slate-600">{draft.stops.length} address stop(s) · {draft.missingAddressOrders} booking(s) need a valid customer address · {draft.notReadyOrders} scheduled delivery ticket(s) not QC-ready</p>
      <div className="space-y-2">{draft.stops.map((stop, index) => <div key={stop.id} className="rounded-lg border border-slate-100 p-2 text-xs">
        <div className="font-semibold">{index + 1}. {stop.customerName}</div>
        <div className="text-slate-600">{stop.address}</div>
        <div className="text-slate-500">Tickets: {stop.orderNumbers.join(", ")}</div>
        {stop.orderIds.map(orderId => {
          const ticket = orders.find(item => item.id === orderId);
          return ticket ? <LaundryHandoverAction key={ticket.id + ":" + leg} order={ticket} leg={leg} /> : null;
        })}
      </div>)}</div>
      <div className="flex flex-wrap gap-2">
        {draft.mapLinks.map((route,index) => <a key={route.stopIds[0]} target="_blank" rel="noopener noreferrer" href={route.url}
          className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
          Google Maps · route {index + 1} ({route.stopIds.length} stops)
        </a>)}
      </div>
      <p className="text-xs text-slate-500">Google Maps uses the displayed worksheet order. When more than eight stops exist, open each route separately. Addresses must be provided by customers.</p>
    </div>}
  </section>;
}
