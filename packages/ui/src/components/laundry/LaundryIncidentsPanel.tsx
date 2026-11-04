"use client";
import * as React from "react";
import type { LaundryOrder } from "@minarvabiz/types";
import {
  can, decideLaundryIncident, LAUNDRY_INCIDENT_TYPES,
  listLaundryIncidents, registerLaundryIncident,
  type LaundryIncidentType,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { inputClass, selectClass } from "../forms/FormField";
import { formatMoney } from "../customers/format";

export function LaundryIncidentsPanel({ orders }: { orders: LaundryOrder[] }) {
  const [visible, setVisible] = React.useState(false);
  const [records, setRecords] = React.useState(() => listLaundryIncidents());
  const [orderId, setOrderId] = React.useState("");
  const [itemTag, setItemTag] = React.useState("");
  const [incidentType, setIncidentType] = React.useState<LaundryIncidentType>("damage");
  const [description, setDescription] = React.useState("");
  const [customerEstimate, setCustomerEstimate] = React.useState("0");
  const [vendorEstimate, setVendorEstimate] = React.useState("0");
  const [resolutionNotes, setResolutionNotes] = React.useState<Record<string, string>>({});
  const [feedback, setFeedback] = React.useState<{ error: boolean; text: string } | null>(null);
  const activeOrders = React.useMemo(() => orders.filter(order => order.status !== "cancelled" && !order.deletedAt), [orders]);
  const selectedOrder = activeOrders.find(order => order.id === orderId);
  const permitted = can("orders.manage") && can("orders.assign");

  const refresh = () => setRecords(listLaundryIncidents());

  function register() {
    try {
      registerLaundryIncident({
        orderId, itemTag: itemTag || null, incidentType, description,
        estimatedCustomerCompensation: Number(customerEstimate),
        estimatedVendorRecovery: selectedOrder?.mode === "outsourced" ? Number(vendorEstimate) : 0,
      });
      refresh(); setDescription(""); setCustomerEstimate("0"); setVendorEstimate("0");
      setFeedback({ error: false, text: "Incident recorded. Estimate does not create a refund or journal entry." });
    } catch (error) {
      setFeedback({ error: true, text: error instanceof Error ? error.message : "Unable to record incident" });
    }
  }
  function finalize(id: string, status: "resolved" | "rejected") {
    try {
      decideLaundryIncident({ id, status, notes: resolutionNotes[id] || "" });
      refresh(); setFeedback({ error: false, text: "Incident decision saved. Post any actual refund separately." });
    } catch (error) {
      setFeedback({ error: true, text: error instanceof Error ? error.message : "Unable to resolve incident" });
    }
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-sm font-semibold text-slate-900">Garment damage, loss & rework register</h3>
        <p className="text-xs text-slate-500">{records.filter(row => row.status === "open").length} open claim(s) · Local backup included</p></div>
      <Button size="sm" variant="outline" onClick={() => { setVisible(v => !v); refresh(); }}>{visible ? "Hide claims" : "Manage claims"}</Button>
    </div>
    {visible && <div className="mt-3 space-y-4">
      <p className="text-xs text-amber-700">Claim amounts are estimates only. No automatic compensation, vendor recovery, refund or accounting posting. This register currently stays on this device.</p>
      {permitted && <div className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
        <label className="text-xs font-medium">Laundry ticket
          <select className={selectClass+" mt-1"} value={orderId} onChange={e => {setOrderId(e.target.value);setItemTag("");}}>
            <option value="">Select ticket</option>{activeOrders.map(order => <option key={order.id} value={order.id}>{order.orderNumber} · {order.customerName || order.customerId}</option>)}
          </select></label>
        <label className="text-xs font-medium">Garment tag
          <select className={selectClass+" mt-1"} value={itemTag} onChange={e => setItemTag(e.target.value)}>
            <option value="">Entire ticket / unspecified</option>{selectedOrder?.items?.map(item => <option key={item.id} value={item.tagCode}>{item.tagCode} · {item.label}</option>)}
          </select></label>
        <label className="text-xs font-medium">Incident category
          <select className={selectClass+" mt-1"} value={incidentType} onChange={e => setIncidentType(e.target.value as LaundryIncidentType)}>
            {LAUNDRY_INCIDENT_TYPES.map(type => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
          </select></label>
        <label className="text-xs font-medium">Description
          <textarea className={inputClass+" mt-1"} maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} placeholder="What happened, evidence, action required"/></label>
        <label className="text-xs font-medium">Estimated customer compensation
          <input className={inputClass+" mt-1"} type="number" min="0" step="0.01" value={customerEstimate} onChange={e => setCustomerEstimate(e.target.value)}/></label>
        <label className="text-xs font-medium">Estimated vendor recovery
          <input className={inputClass+" mt-1"} type="number" min="0" step="0.01" disabled={selectedOrder?.mode !== "outsourced"} value={selectedOrder?.mode !== "outsourced"?"0":vendorEstimate} onChange={e => setVendorEstimate(e.target.value)}/></label>
        <div className="sm:col-span-2"><Button size="sm" disabled={!orderId || !description.trim()} onClick={register}>Record incident</Button></div>
      </div>}
      {feedback && <p role={feedback.error?"alert":"status"} className={feedback.error?"text-sm text-rose-700":"text-sm text-slate-600"}>{feedback.text}</p>}
      <div className="space-y-2">{records.length === 0 ? <p className="text-sm text-slate-500">No garment claims recorded.</p> :
        records.map(record => {
          const order = orders.find(o => o.id === record.orderId);
          return <div key={record.id} className="rounded-lg border border-slate-200 p-3 text-xs">
            <div className="flex flex-wrap justify-between gap-2"><strong>{order?.orderNumber || record.orderId} · {record.incidentType.replaceAll("_", " ")}</strong>
              <span className="capitalize">{record.status}</span></div>
            <p className="mt-1 whitespace-pre-wrap">{record.description}</p>
            <p className="mt-1 text-slate-600">{record.itemTag || "Whole ticket"} · Customer estimate {formatMoney(record.estimatedCustomerCompensation)} · Vendor estimate {formatMoney(record.estimatedVendorRecovery)}</p>
            {record.resolutionNotes && <p className="mt-1">Decision: {record.resolutionNotes}</p>}
            {permitted && record.status === "open" && <div className="mt-2 flex flex-wrap gap-2">
              <input className={inputClass+" min-w-[200px] flex-1"} aria-label={"Resolution notes for "+record.id} placeholder="Resolution notes required" maxLength={2000}
                value={resolutionNotes[record.id]||""} onChange={e => setResolutionNotes(v => ({...v,[record.id]:e.target.value}))}/>
              <Button size="sm" variant="outline" disabled={!resolutionNotes[record.id]?.trim()} onClick={() => finalize(record.id,"resolved")}>Resolve claim</Button>
              <Button size="sm" variant="outline" disabled={!resolutionNotes[record.id]?.trim()} onClick={() => finalize(record.id,"rejected")}>Reject claim</Button>
            </div>}
          </div>;
        })}</div>
    </div>}
  </section>;
}
