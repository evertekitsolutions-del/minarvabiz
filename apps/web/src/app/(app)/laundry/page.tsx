"use client";

import * as React from "react";
import { LaundryList, LaundryForm, Modal } from "@minarvabiz/ui";
import { store, phase5Store } from "@minarvabiz/business-logic";
import type { LaundryOrder, Customer, Supplier } from "@minarvabiz/types";

export default function LaundryPage() {
  const [orders, setOrders] = React.useState<LaundryOrder[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [query, setQuery] = React.useState("");
  const [mode, setMode] = React.useState<"outsourced" | "in_house_ironing" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    setOrders(phase5Store.listLaundryOrders({ query: query || undefined }));
    setCustomers(store.listCustomers());
    setSuppliers(phase5Store.listSuppliers());
  }, [query]);

  React.useEffect(() => { refresh(); }, [refresh]);

  function handleSubmit(data: {
    customerId: string;
    garment: string;
    quantity: number;
    supplierId: string | null;
    supplierRate: number;
    customerRate: number;
    paidAmount: number;
    notes: string;
  }) {
    if (!mode) return;
    const result = phase5Store.createLaundryOrder({
      ...data,
      mode,
      paymentMethod: "cash",
    });
    if (result.errors.length) {
      setError(result.errors.join("; "));
      return;
    }
    setMode(null);
    setError(null);
    refresh();
  }

  return (
    <>
      <LaundryList
        orders={orders}
        onSearch={setQuery}
        onAddOutsourced={() => setMode("outsourced")}
        onAddIroning={() => setMode("in_house_ironing")}
      />
      <Modal
        open={mode !== null}
        title={mode === "outsourced" ? "Outsourced Laundry" : "In-house Ironing"}
        onClose={() => setMode(null)}
      >
        {mode && (
          <LaundryForm
            mode={mode}
            customers={customers}
            suppliers={suppliers}
            onSubmit={handleSubmit}
            onCancel={() => setMode(null)}
            error={error}
          />
        )}
      </Modal>
    </>
  );
}
