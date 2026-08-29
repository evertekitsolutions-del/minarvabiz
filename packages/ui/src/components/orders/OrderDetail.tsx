"use client";

import * as React from "react";
import type { ServiceOrder, OrderStatus } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { formatMoney } from "../customers/format";
import {
  SERVICE_TYPE_LABELS, ORDER_STATUS_LABELS, ORDER_STATUS_FLOW,
} from "@minarvabiz/business-logic";

export function OrderDetail({
  order,
  onStatusChange,
  onAddExpense,
  onClose,
}: {
  order: ServiceOrder;
  onStatusChange?: (status: OrderStatus) => void;
  onAddExpense?: (description: string, amount: number) => void;
  onClose?: () => void;
}) {
  const [expDesc, setExpDesc] = React.useState("");
  const [expAmt, setExpAmt] = React.useState("");
  const profit = {
    revenue: order.price,
    materialCost: order.externalMaterialCost,
    orderSpecificExpenses: order.orderExpensesTotal,
    totalCost: order.externalMaterialCost + order.orderExpensesTotal,
    grossProfit: order.price - order.externalMaterialCost - order.orderExpensesTotal,
  };

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

      {/* Status tracker */}
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

      {order.measurements && Object.keys(order.measurements).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-slate-800">Measurements</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-4">
              {Object.entries(order.measurements).map(([k, v]) =>
                v != null && typeof v !== "object" ? (
                  <div key={k} className="rounded-lg bg-slate-50 px-2 py-1.5">
                    <div className="text-[10px] uppercase text-slate-400">{k}</div>
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
              <input className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Description"
                value={expDesc} onChange={(e) => setExpDesc(e.target.value)} />
              <input className="h-9 w-28 rounded-lg border border-slate-200 px-3 text-sm" type="number" placeholder="Amount"
                value={expAmt} onChange={(e) => setExpAmt(e.target.value)} />
              <Button size="sm" onClick={() => {
                onAddExpense(expDesc, parseFloat(expAmt) || 0);
                setExpDesc(""); setExpAmt("");
              }}>Add</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {order.notes && (
        <p className="text-sm text-slate-600"><span className="font-medium">Notes:</span> {order.notes}</p>
      )}
    </div>
  );
}
