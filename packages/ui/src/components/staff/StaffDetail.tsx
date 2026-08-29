"use client";

import * as React from "react";
import type { StaffMember, StaffAssignment, StaffIncentivePayout, IncentiveRuleRecord } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { formatMoney } from "../customers/format";

export function StaffDetail({
  staff,
  assignments,
  payouts,
  rules,
  productivity,
  onAssign,
  onCompleteAssignment,
  onMarkPaid,
  onClose,
  ordersForAssign,
}: {
  staff: StaffMember;
  assignments: StaffAssignment[];
  payouts: StaffIncentivePayout[];
  rules: IncentiveRuleRecord[];
  productivity: { assigned: number; completed: number; totalIncentive: number; unpaidIncentive: number };
  onAssign?: (orderId: string) => void;
  onCompleteAssignment?: (id: string) => void;
  onMarkPaid?: (id: string) => void;
  onClose?: () => void;
  ordersForAssign?: Array<{ id: string; label: string }>;
}) {
  const [orderId, setOrderId] = React.useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{staff.name}</h2>
          <p className="text-sm capitalize text-slate-500">{staff.role} · {staff.status}</p>
        </div>
        {onClose && <Button variant="outline" onClick={onClose}>Back</Button>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="text-xs text-slate-500">Assigned</div>
          <div className="text-xl font-bold">{productivity.assigned}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-slate-500">Completed</div>
          <div className="text-xl font-bold">{productivity.completed}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-slate-500">Total incentive</div>
          <div className="text-xl font-bold text-emerald-600">{formatMoney(productivity.totalIncentive)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-slate-500">Unpaid</div>
          <div className="text-xl font-bold text-amber-600">{formatMoney(productivity.unpaidIncentive)}</div>
        </CardContent></Card>
      </div>

      {onAssign && ordersForAssign && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Assign to order</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <select className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm" value={orderId}
              onChange={(e) => setOrderId(e.target.value)}>
              <option value="">Select open order</option>
              {ordersForAssign.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <Button disabled={!orderId} onClick={() => { onAssign(orderId); setOrderId(""); }}>Assign</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Assignments</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {assignments.length === 0 && <p className="text-sm text-slate-400">No assignments</p>}
          {assignments.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{a.orderNumber}</div>
                <div className="text-xs text-slate-500">{a.serviceType} · {a.status}</div>
              </div>
              {a.status === "assigned" && onCompleteAssignment && (
                <Button size="sm" variant="outline" onClick={() => onCompleteAssignment(a.id)}>
                  Complete
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Incentives</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="mb-2 text-xs text-slate-500">
            Active rules: {rules.map((r) => r.name).join(", ") || "none"}
          </div>
          {payouts.length === 0 && <p className="text-sm text-slate-400">No incentive payouts yet</p>}
          {payouts.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{formatMoney(p.amount)} · {p.orderNumber}</div>
                <div className="text-xs text-slate-500">
                  {new Date(p.calculatedAt).toLocaleDateString("en-IN")} · {p.paid ? "Paid" : "Unpaid"}
                </div>
              </div>
              {!p.paid && onMarkPaid && (
                <Button size="sm" onClick={() => onMarkPaid(p.id)}>Mark paid</Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
