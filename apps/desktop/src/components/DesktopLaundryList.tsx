"use client";

import * as React from "react";
import { phase5Store } from "@minarvabiz/business-logic";
import type { LaundryOrder, PaymentMethod } from "@minarvabiz/types";
import { LaundryList } from "@minarvabiz/ui";
import type { useDesktopCustomerCollection } from "../lib/use-desktop-customer-collection";

type Collection = ReturnType<typeof useDesktopCustomerCollection>;
type Result = { success: boolean; error?: string; order?: LaundryOrder; pendingSave?: boolean };
type Props = Omit<React.ComponentProps<typeof LaundryList>, "onCollectPayment" | "onRetryPaymentSave"> & {
  collection: Collection;
  onPaymentSaved: () => void;
};

export function DesktopLaundryList({ collection, onPaymentSaved, ...props }: Props) {
  const pendingTicket = React.useRef<string | null>(null);

  const collectDue = async (ticket: LaundryOrder, amount: number, method: PaymentMethod): Promise<Result> => {
    if (collection.hasPending()) {
      return { success: false, error: "Another customer payment needs SQLite confirmation. Retry the pending save in Customers before collecting again." };
    }
    try {
      const result = await collection.collect({
        customerId: ticket.customerId,
        amount,
        method,
        target: { sourceType: "laundry", id: ticket.id },
      });
      if (!result.ok) {
        pendingTicket.current = collection.hasPending() ? ticket.id : null;
        return { success: false, error: result.error, pendingSave: pendingTicket.current === ticket.id };
      }
      pendingTicket.current = null;
      onPaymentSaved();
      return { success: true, order: phase5Store.listLaundryOrders().find(item => item.id === ticket.id) };
    } catch (cause) {
      pendingTicket.current = collection.hasPending() ? ticket.id : null;
      return {
        success: false,
        error: cause instanceof Error ? cause.message : String(cause),
        pendingSave: pendingTicket.current === ticket.id,
      };
    }
  };
  const retryDueSave = async (ticket: LaundryOrder): Promise<Result> => {
    if (pendingTicket.current !== ticket.id || !collection.hasPending()) {
      return { success: false, error: "No matching unsaved laundry payment. Review pending payments in Customers." };
    }
    const result = await collection.retryPending();
    if (!result.ok) return { success: false, error: result.error, pendingSave: true };
    pendingTicket.current = null;
    onPaymentSaved();
    return { success: true, order: phase5Store.listLaundryOrders().find(item => item.id === ticket.id) };
  };

  return <LaundryList {...props} onCollectPayment={collectDue} onRetryPaymentSave={retryDueSave} />;
}
