"use client";

import * as React from "react";
import type { CustomerCrmProfile } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { formatMoney } from "../customers/format";

export function CustomerProfile({
  profile,
  onClose,
}: {
  profile: CustomerCrmProfile;
  onClose?: () => void;
}) {
  const { customer } = profile;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{customer.name}</h2>
          <p className="text-sm text-slate-500">
            {[customer.phone, customer.whatsapp, customer.email].filter(Boolean).join(" · ")}
          </p>
          {customer.address && <p className="text-sm text-slate-500">{customer.address}</p>}
        </div>
        {onClose && <Button variant="outline" onClick={onClose}>Back</Button>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="text-xs text-slate-500">Total spending</div>
          <div className="text-lg font-bold">{formatMoney(customer.totalSpending)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-slate-500">Outstanding</div>
          <div className={`text-lg font-bold ${customer.outstandingBalance > 0 ? "text-rose-600" : ""}`}>
            {formatMoney(customer.outstandingBalance)}
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-slate-500">Orders</div>
          <div className="text-lg font-bold">{profile.orderCount}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-slate-500">Measurements</div>
          <div className="text-lg font-bold">{profile.measurementCount}</div>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Recent orders</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {profile.recentOrders.length === 0 && <p className="text-sm text-slate-400">None</p>}
            {profile.recentOrders.map((o) => (
              <div key={o.id} className="flex justify-between text-sm">
                <span>{o.orderNumber} <span className="text-slate-400">({o.status})</span></span>
                <span className="font-medium">{formatMoney(o.price)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Recent sales</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {profile.recentSales.length === 0 && <p className="text-sm text-slate-400">None</p>}
            {profile.recentSales.map((s) => (
              <div key={s.id} className="flex justify-between text-sm">
                <span>{s.invoiceNumber}</span>
                <span className="font-medium">{formatMoney(s.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {customer.notes && (
        <p className="text-sm text-slate-600"><span className="font-medium">Notes:</span> {customer.notes}</p>
      )}
    </div>
  );
}
