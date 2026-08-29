"use client";

import * as React from "react";
import { Button, Card, CardContent } from "@minarvabiz/ui";
import {
  listReadyToDeliver,
  printDeliveryChallan,
  ordersStore,
} from "@minarvabiz/business-logic";
import { formatMoney } from "@minarvabiz/utils";

export default function DeliveryPage() {
  const [orders, setOrders] = React.useState(() => listReadyToDeliver());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Ready to deliver</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setOrders(listReadyToDeliver())}>
            Refresh
          </Button>
          <Button onClick={() => printDeliveryChallan(orders)} disabled={!orders.length}>
            Print challan
          </Button>
        </div>
      </div>
      <Card>
        <CardContent className="divide-y divide-slate-100 p-0">
          {orders.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-400">No ready orders</p>
          )}
          {orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{o.orderNumber}</div>
                <div className="text-slate-500">{o.customerName}</div>
              </div>
              <div className="text-right">
                <div>{formatMoney(o.balance)} due</div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    ordersStore.updateOrderStatus(o.id, "delivered");
                    setOrders(listReadyToDeliver());
                  }}
                >
                  Mark delivered
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
