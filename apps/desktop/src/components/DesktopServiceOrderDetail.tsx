"use client";

import * as React from "react";
import { ordersStore } from "@minarvabiz/business-logic";
import type { PaymentMethod, ServiceOrder } from "@minarvabiz/types";
import { Button, Modal, OrderDetail, inputClass, selectClass } from "@minarvabiz/ui";
import { parseDesktopPurchaseMoney } from "../lib/desktop-purchase-amount";
import type { useDesktopCustomerCollection } from "../lib/use-desktop-customer-collection";

type Collection = ReturnType<typeof useDesktopCustomerCollection>;
type Props = React.ComponentProps<typeof OrderDetail> & {
  collection: Collection;
  onPaymentSaved: (order: ServiceOrder, paymentId: string) => void;
};

/** Windows-only source-targeted collection UI. The app owns the durable coordinator. */
export function DesktopServiceOrderDetail({ collection, onPaymentSaved, ...detail }: Props) {
  const { order } = detail;
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("cash");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [retry, setRetry] = React.useState(false);
  const [receipt, setReceipt] = React.useState<string | null>(null);

  function openCollection() {
    setAmount(order.balance.toFixed(2));
    setMethod("cash");
    setError(collection.hasPending()
      ? "An earlier customer payment is awaiting SQLite confirmation. Retry it in Customers first."
      : null);
    setRetry(false);
    setReceipt(null);
    setOpen(true);
  }

  async function saveCollection() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let result;
      if (retry) {
        result = await collection.retryPending();
      } else {
        if (collection.hasPending()) throw new Error("Save the earlier customer payment before collecting again.");
        const value = parseDesktopPurchaseMoney(amount, "Service order payment");
        if (value <= 0) throw new Error("Enter a positive payment amount.");
        const live = ordersStore.getOrder(order.id);
        if (!live || live.customerId !== order.customerId || live.status === "cancelled") {
          throw new Error("Selected service order needs reconciliation.");
        }
        result = await collection.collect({
          customerId: order.customerId,
          amount: value,
          method,
          target: { sourceType: "service_order", id: order.id },
        });
      }
      if (!result.ok) {
        setRetry(collection.hasPending());
        setError(result.error);
        return;
      }
      const updated = ordersStore.getOrder(order.id);
      if (updated) onPaymentSaved({ ...updated }, result.paymentId);
      setReceipt(result.paymentId);
      setRetry(false);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <OrderDetail {...detail} onCollectBalance={openCollection} />
      {receipt && (
        <p role="status" className="text-sm text-green-700">
          Service payment confirmed in SQLite. Receipt reference: {receipt}. The payment ledger records the order number.
        </p>
      )}
      <Modal open={open} title="Collect service order balance" onClose={() => { if (!busy) setOpen(false); }}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Order {order.orderNumber} · Remaining: {order.balance.toFixed(2)}
          </p>
          <label className="block space-y-1 text-sm">
            Amount
            <input aria-label="Service order collection amount" className={inputClass}
              inputMode="decimal" value={amount} disabled={busy || retry} onChange={event => setAmount(event.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">
            Payment method
            <select aria-label="Service order collection method" className={selectClass}
              value={method} disabled={busy || retry} onChange={event => setMethod(event.target.value as PaymentMethod)}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank">Bank</option>
              <option value="online">Online</option>
              <option value="other">Other</option>
            </select>
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => { void saveCollection(); }}>
              {retry ? "Retry SQLite save" : "Collect and save"}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Close</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
