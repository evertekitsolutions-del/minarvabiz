"use client";

import * as React from "react";
import type { OrderStatus, ServiceOrder, StaffAssignment, StaffMember } from "@minarvabiz/types";
import { canTransition, ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, SERVICE_TYPE_LABELS } from "@minarvabiz/business-logic";

const BOARD_STATUSES: OrderStatus[] = ORDER_STATUS_FLOW.filter((status) => status !== "delivered");

const columnTone: Record<OrderStatus, string> = {
  pending: "border-slate-200 bg-slate-50",
  received: "border-slate-200 bg-slate-50",
  cutting: "border-blue-200 bg-blue-50/60",
  stitching: "border-violet-200 bg-violet-50/60",
  alteration: "border-pink-200 bg-pink-50/60",
  qc: "border-amber-200 bg-amber-50/60",
  processing: "border-cyan-200 bg-cyan-50/60",
  ready_to_deliver: "border-emerald-200 bg-emerald-50/60",
  delivered: "border-slate-200 bg-slate-50",
  cancelled: "border-rose-200 bg-rose-50/60",
};

function deliveryRisk(order: ServiceOrder, now = new Date()): "overdue" | "today" | "soon" | null {
  if (!order.deliveryDate) return null;
  const due = new Date(order.deliveryDate);
  if (Number.isNaN(due.getTime())) return null;
  const start = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((start(due) - start(now)) / 86_400_000);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 2) return "soon";
  return null;
}

function riskClass(risk: ReturnType<typeof deliveryRisk>): string {
  if (risk === "overdue") return "bg-rose-100 text-rose-700 ring-rose-200";
  if (risk === "today") return "bg-amber-100 text-amber-800 ring-amber-200";
  if (risk === "soon") return "bg-orange-100 text-orange-700 ring-orange-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function sortOrders(list: ServiceOrder[]): ServiceOrder[] {
  return [...list].sort((a, b) => {
    const ad = a.deliveryDate ? new Date(a.deliveryDate).getTime() : Number.POSITIVE_INFINITY;
    const bd = b.deliveryDate ? new Date(b.deliveryDate).getTime() : Number.POSITIVE_INFINITY;
    return ad - bd || b.createdAt.localeCompare(a.createdAt);
  });
}

export interface ProductionBoardProps {
  orders: ServiceOrder[];
  staff?: StaffMember[];
  assignments?: StaffAssignment[];
  onSelect?: (order: ServiceOrder) => void;
  onStatusChange?: (orderId: string, status: OrderStatus) => void;
}

export function ProductionBoard({ orders, staff = [], assignments = [], onSelect, onStatusChange }: ProductionBoardProps) {
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = React.useState<OrderStatus | null>(null);
  const staffById = React.useMemo(() => new Map(staff.map((member) => [member.id, member])), [staff]);
  const latestAssignmentByOrder = React.useMemo(() => {
    const map = new Map<string, StaffAssignment>();
    for (const assignment of assignments) {
      if (assignment.status === "cancelled") continue;
      const previous = map.get(assignment.orderId);
      if (!previous || assignment.assignedAt > previous.assignedAt) map.set(assignment.orderId, assignment);
    }
    return map;
  }, [assignments]);

  const activeOrders = React.useMemo(
    () => orders.filter((order) => !order.deletedAt && BOARD_STATUSES.includes(order.status)),
    [orders]
  );

  const handleDrop = (status: OrderStatus) => {
    if (!draggingId) return;
    const order = activeOrders.find((item) => item.id === draggingId);
    setDraggingId(null);
    setDragOverStatus(null);
    if (!order || order.status === status || !canTransition(order.status, status)) return;
    onStatusChange?.(order.id, status);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Production Board</h2>
          <p className="text-sm text-slate-500">Move jobs through valid stages while keeping delivery risk visible.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">Overdue</span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800">Due today</span>
          <span className="rounded-full bg-orange-50 px-2.5 py-1 font-medium text-orange-700">Due in 2 days</span>
        </div>
      </div>

      <div className="grid gap-3 overflow-x-auto pb-2 xl:grid-cols-4 2xl:grid-cols-8">
        {BOARD_STATUSES.map((status) => {
          const columnOrders = sortOrders(activeOrders.filter((order) => order.status === status));
          return (
            <section
              key={status}
              onDragOver={(event) => {
                event.preventDefault();
                if (draggingId) setDragOverStatus(status);
              }}
              onDragLeave={() => setDragOverStatus((current) => (current === status ? null : current))}
              onDrop={() => handleDrop(status)}
              className={`min-w-[250px] rounded-2xl border p-3 transition ${columnTone[status]} ${dragOverStatus === status ? "ring-2 ring-blue-300" : ""}`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{ORDER_STATUS_LABELS[status]}</h3>
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold text-slate-600">{columnOrders.length}</span>
              </div>
              <div className="space-y-2">
                {columnOrders.map((order) => {
                  const assignment = latestAssignmentByOrder.get(order.id);
                  const staffId = assignment?.staffId ?? order.assignedStaffId ?? order.assignedTailorId ?? null;
                  const staffName = staffId ? staffById.get(staffId)?.name ?? assignment?.staffName ?? null : null;
                  const risk = deliveryRisk(order);
                  const delivery = order.deliveryDate
                    ? new Date(order.deliveryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
                    : "No due date";
                  return (
                    <article
                      key={order.id}
                      draggable
                      onDragStart={() => setDraggingId(order.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverStatus(null);
                      }}
                      onClick={() => onSelect?.(order)}
                      className={`cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${draggingId === order.id ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">{order.orderNumber}</div>
                          <div className="mt-0.5 truncate text-xs text-slate-500">{order.customerName || "Walk-in customer"}</div>
                        </div>
                        {risk && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${riskClass(risk)}`}>{risk === "overdue" ? "OVERDUE" : risk === "today" ? "TODAY" : "SOON"}</span>}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span className="truncate">{SERVICE_TYPE_LABELS[order.serviceType] ?? order.serviceType}</span>
                        <span className="shrink-0 font-medium text-slate-700">{delivery}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className={`truncate text-[11px] font-medium ${staffName ? "text-slate-700" : "text-rose-600"}`}>{staffName ? `👤 ${staffName}` : "Unassigned"}</span>
                        <select
                          aria-label={`Change status for ${order.orderNumber}`}
                          value={order.status}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => onStatusChange?.(order.id, event.target.value as OrderStatus)}
                          className="h-7 max-w-[120px] rounded-md border border-slate-200 bg-white px-1.5 text-[10px] text-slate-700"
                        >
                          {BOARD_STATUSES.map((nextStatus) => (
                            <option key={nextStatus} value={nextStatus} disabled={nextStatus !== order.status && !canTransition(order.status, nextStatus)}>{ORDER_STATUS_LABELS[nextStatus]}</option>
                          ))}
                        </select>
                      </div>
                    </article>
                  );
                })}
                {columnOrders.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-5 text-center text-xs text-slate-400">Drop a job here</div>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
