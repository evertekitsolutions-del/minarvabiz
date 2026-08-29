"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";

export type OrderStatusBadge =
  | "pending"
  | "processing"
  | "ready"
  | "delivered"
  | "cancelled";

export interface RecentOrderRow {
  id: string;
  orderNo: string;
  customer: string;
  type: string;
  status: OrderStatusBadge;
  dueDate: string;
}

const statusStyles: Record<OrderStatusBadge, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  processing: "bg-blue-50 text-blue-700 ring-blue-200",
  ready: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  delivered: "bg-slate-100 text-slate-600 ring-slate-200",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-200",
};

const statusLabels: Record<OrderStatusBadge, string> = {
  pending: "Pending",
  processing: "Processing",
  ready: "Ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function RecentOrders({
  title = "Recent Orders",
  rows,
  onViewAll,
  className,
}: {
  title?: string;
  rows: RecentOrderRow[];
  onViewAll?: () => void;
  className?: string;
}) {
  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
        <CardTitle className="text-base font-semibold text-slate-800">{title}</CardTitle>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            View All
          </button>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto pt-4">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="pb-2 font-medium">Order No.</th>
              <th className="pb-2 font-medium">Customer</th>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Due Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((row) => (
              <tr key={row.id} className="text-slate-700">
                <td className="py-3 font-medium text-slate-900">{row.orderNo}</td>
                <td className="py-3">{row.customer}</td>
                <td className="py-3">{row.type}</td>
                <td className="py-3">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                      statusStyles[row.status]
                    )}
                  >
                    {statusLabels[row.status]}
                  </span>
                </td>
                <td className="py-3 text-slate-500">{row.dueDate}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  No recent orders
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
