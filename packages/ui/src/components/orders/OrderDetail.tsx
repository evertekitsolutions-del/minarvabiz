"use client";

import * as React from "react";
import type { MeasurementProfile, ServiceOrder, OrderStatus } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { formatMoney } from "../customers/format";
import {
  SERVICE_TYPE_LABELS, ORDER_STATUS_LABELS, ORDER_STATUS_FLOW,
  measurementRevisionHistory, ordersStore,
} from "@minarvabiz/business-logic";

function measurementLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (value) => value.toUpperCase());
}

export function OrderDetail({
  order,
  measurementProfiles,
  onStatusChange,
  onQualityCheck,
  onAddExpense,
  onClose,
}: {
  order: ServiceOrder;
  measurementProfiles?: MeasurementProfile[];
  onStatusChange?: (status: OrderStatus) => void;
  onQualityCheck?: (input: { passed: boolean; notes: string; issues: string[] }) => void;
  onAddExpense?: (description: string, amount: number) => void;
  onClose?: () => void;
}) {
  const [expDesc, setExpDesc] = React.useState("");
  const [expAmt, setExpAmt] = React.useState("");
  const [qcNotes, setQcNotes] = React.useState("");
  const [qcIssue, setQcIssue] = React.useState("");
  const [qcIssues, setQcIssues] = React.useState<string[]>([]);
  const profit = {
    revenue: order.price,
    materialCost: order.externalMaterialCost,
    orderSpecificExpenses: order.orderExpensesTotal,
    totalCost: order.externalMaterialCost + order.orderExpensesTotal,
    grossProfit: order.price - order.externalMaterialCost - order.orderExpensesTotal,
  };
  const profiles = measurementProfiles ?? ordersStore.listMeasurementProfiles(order.customerId);
  const selectedProfile = order.measurementProfileId
    ? profiles.find((profile) => profile.id === order.measurementProfileId) ?? null
    : null;
  const measurementHistory = selectedProfile
    ? measurementRevisionHistory(profiles, selectedProfile)
    : [];
  const qualityCheck = order.qualityCheck ?? null;

  function addQcIssue() {
    const issue = qcIssue.trim();
    if (!issue) return;
    if (!qcIssues.includes(issue)) setQcIssues((items) => [...items, issue]);
    setQcIssue("");
  }

  function submitQc(passed: boolean) {
    onQualityCheck?.({ passed, notes: qcNotes.trim(), issues: qcIssues });
    setQcNotes("");
    setQcIssue("");
    setQcIssues([]);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{order.orderNumber}</h2>
          <p className="text-sm text-slate-500">
            {order.customerName} · {SERVICE_TYPE_LABELS[order.serviceType]}
          </p>
        </div>
        {onClose && <Button variant="outline" onClick={onClose}>Close</Button>}
      </div>

      <div className="flex flex-wrap gap-2">
        {ORDER_STATUS_FLOW.map((s) => {
          const active = order.status === s;
          const done =
            ORDER_STATUS_FLOW.indexOf(order.status) > ORDER_STATUS_FLOW.indexOf(s) ||
            order.status === "delivered";
          return (
            <button
              key={s}
              type="button"
              disabled={!onStatusChange || order.status === "cancelled" || order.status === "delivered"}
              onClick={() => onStatusChange?.(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${
                active
                  ? "bg-indigo-600 text-white ring-indigo-600"
                  : done
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : "bg-slate-50 text-slate-500 ring-slate-200"
              }`}
            >
              {ORDER_STATUS_LABELS[s]}
            </button>
          );
        })}
        {order.status !== "cancelled" && order.status !== "delivered" && onStatusChange && (
          <button
            type="button"
            onClick={() => onStatusChange("cancelled")}
            className="rounded-full px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-inset ring-rose-200"
          >
            Cancel
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-slate-800">Pricing</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Price</span><span>{formatMoney(order.price)}</span></div>
            <div className="flex justify-between"><span>Advance</span><span>{formatMoney(order.advance)}</span></div>
            <div className="flex justify-between font-semibold"><span>Balance</span><span className={order.balance > 0 ? "text-rose-600" : ""}>{formatMoney(order.balance)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Delivery</span>
              <span>{order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString("en-IN") : "—"}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-slate-800">Profit (order-specific)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Revenue</span><span>{formatMoney(profit.revenue)}</span></div>
            <div className="flex justify-between"><span>Material cost</span><span>{formatMoney(profit.materialCost)}</span></div>
            <div className="flex justify-between"><span>Order expenses</span><span>{formatMoney(profit.orderSpecificExpenses)}</span></div>
            <div className="flex justify-between font-semibold text-emerald-700">
              <span>Gross profit</span><span>{formatMoney(profit.grossProfit)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {(order.status === "qc" || qualityCheck) && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold text-slate-800">Quality Check</CardTitle>
              {qualityCheck && (
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${qualityCheck.status === "passed" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  {qualityCheck.status === "passed" ? "PASSED" : "REWORK REQUIRED"}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {qualityCheck && (
              <div className={`rounded-xl border p-3 ${qualityCheck.status === "passed" ? "border-emerald-200 bg-emerald-50/50" : "border-rose-200 bg-rose-50/50"}`}>
                <div className="text-xs text-slate-500">Checked {new Date(qualityCheck.checkedAt).toLocaleString("en-IN")}</div>
                {qualityCheck.issues.length > 0 && <div className="mt-2 text-sm"><span className="font-medium">Issues:</span> {qualityCheck.issues.join(" · ")}</div>}
                {qualityCheck.notes && <div className="mt-1 text-sm"><span className="font-medium">Notes:</span> {qualityCheck.notes}</div>}
              </div>
            )}
            {order.status === "qc" && onQualityCheck && (
              <>
                <div className="flex gap-2">
                  <input className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Add QC issue" value={qcIssue} onChange={(event) => setQcIssue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addQcIssue(); } }} />
                  <Button variant="outline" size="sm" onClick={addQcIssue}>Add issue</Button>
                </div>
                {qcIssues.length > 0 && <div className="flex flex-wrap gap-2">{qcIssues.map((issue) => <button key={issue} type="button" onClick={() => setQcIssues((items) => items.filter((item) => item !== issue))} className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">{issue} ×</button>)}</div>}
                <textarea className="h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="QC notes" value={qcNotes} onChange={(event) => setQcNotes(event.target.value)} />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => submitQc(false)} disabled={qcIssues.length === 0}>Send for Rework</Button>
                  <Button onClick={() => submitQc(true)}>Pass QC & Continue</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {measurementHistory.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold text-slate-800">Measurement history</CardTitle>
              <span className="text-xs text-slate-400">{selectedProfile?.label} · {measurementHistory.length} revision{measurementHistory.length === 1 ? "" : "s"}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {measurementHistory.map((profile, index) => (
              <div key={profile.id} className={`rounded-xl border p-3 ${index === 0 ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200 bg-slate-50/50"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-800">
                    Revision {measurementHistory.length - index}
                    {index === 0 && <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">USED BY THIS ORDER</span>}
                  </div>
                  <span className="text-xs text-slate-500">{new Date(profile.recordedAt).toLocaleString("en-IN")}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Object.entries(profile.fields).map(([key, value]) =>
                    value != null && (
                      <div key={key} className="rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-100">
                        <div className="text-[10px] uppercase text-slate-400">{measurementLabel(key)}</div>
                        <div className="text-sm font-medium text-slate-800">{String(value)}</div>
                      </div>
                    )
                  )}
                </div>
                {profile.notes && <p className="mt-2 text-xs text-slate-500">{profile.notes}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {order.measurements && Object.keys(order.measurements).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-slate-800">Measurements used on order</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-4">
              {Object.entries(order.measurements).map(([k, v]) =>
                v != null && typeof v !== "object" ? (
                  <div key={k} className="rounded-lg bg-slate-50 px-2 py-1.5">
                    <div className="text-[10px] uppercase text-slate-400">{measurementLabel(k)}</div>
                    <div className="font-medium">{String(v)}</div>
                  </div>
                ) : null
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {order.tshirt && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-slate-800">T-shirt printing</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm">
            <div>Type: {order.tshirt.tshirtType || "—"}</div>
            <div>Size: {order.tshirt.size || "—"}</div>
            <div>Color: {order.tshirt.color || "—"}</div>
            <div>Qty: {order.tshirt.quantity}</div>
            <div>Print: {order.tshirt.printingType || "—"}</div>
            <div>Design: {order.tshirt.designDescription || "—"}</div>
            <div>Print cost: {formatMoney(order.tshirt.printingCost)}</div>
            <div>Customer price: {formatMoney(order.tshirt.customerPrice)}</div>
          </CardContent>
        </Card>
      )}

      {onAddExpense && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-slate-800">Order-specific expense</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {order.expenses.map((e) => (
              <div key={e.id} className="flex justify-between text-sm">
                <span>{e.description}</span>
                <span>{formatMoney(e.amount)}</span>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <input className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Description" value={expDesc} onChange={(e) => setExpDesc(e.target.value)} />
              <input className="h-9 w-28 rounded-lg border border-slate-200 px-3 text-sm" type="number" placeholder="Amount" value={expAmt} onChange={(e) => setExpAmt(e.target.value)} />
              <Button size="sm" onClick={() => { onAddExpense(expDesc, parseFloat(expAmt) || 0); setExpDesc(""); setExpAmt(""); }}>Add</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {order.notes && <p className="text-sm text-slate-600"><span className="font-medium">Notes:</span> {order.notes}</p>}
    </div>
  );
}
