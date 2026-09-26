"use client";

import * as React from "react";
import { PaymentsPanel } from "@minarvabiz/ui";
import { store, phase5Store, phase6Store, templatePaymentDue, templatePaymentReceived } from "@minarvabiz/business-logic";
import type { Customer, Payment, Supplier } from "@minarvabiz/types";

export default function PaymentsPage() {
  const [outstanding, setOutstanding] = React.useState<Customer[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [payments, setPayments] = React.useState<Payment[]>([]);

  const refresh = React.useCallback(() => {
    setOutstanding(store.listOutstandingCustomers());
    setCustomers(store.listCustomers());
    setSuppliers(phase5Store.listSuppliers());
    setPayments(store.listPayments());
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  return (
    <PaymentsPanel
      outstanding={outstanding}
      payments={payments}
      customers={customers}
      suppliers={suppliers}
      onCollect={(data) => {
        const result = store.recordCustomerPayment({
          customerId: data.customerId,
          amount: data.amount,
          method: data.method,
          notes: data.notes,
        });
        if (result.errors.length || !result.payment) {
          return { ok: false, error: result.errors.join("; ") || "Failed" };
        }
        if (result.customer) {
          const msg = templatePaymentReceived(result.customer, result.payment.amount);
          phase6Store.pushNotification({ kind: "system", title: msg.title, body: msg.body, href: "/payments" });
        }
        refresh();
        return { ok: true };
      }}
      onRemind={(customer) => {
        const msg = templatePaymentDue(customer);
        phase6Store.pushNotification({ kind: "payment_due", title: msg.title, body: msg.body, href: "/payments" });
        refresh();
      }}
    />
  );
}
