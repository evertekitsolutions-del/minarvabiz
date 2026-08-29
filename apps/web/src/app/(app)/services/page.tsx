"use client";

import * as React from "react";
import {
  OrderList, OrderForm, emptyOrderForm, OrderDetail, Modal,
  type OrderFormValues,
} from "@minarvabiz/ui";
import { store, ordersStore } from "@minarvabiz/business-logic";
import type {
  ServiceOrder, Customer, MeasurementProfile, ServiceType, OrderStatus,
} from "@minarvabiz/types";

export default function ServicesOrdersPage() {
  const [orders, setOrders] = React.useState<ServiceOrder[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [profiles, setProfiles] = React.useState<MeasurementProfile[]>([]);
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<OrderStatus | null>(null);
  const [serviceType, setServiceType] = React.useState<ServiceType | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState<OrderFormValues>(emptyOrderForm());
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<ServiceOrder | null>(null);

  const refresh = React.useCallback(() => {
    setCustomers(store.listCustomers());
    setOrders(ordersStore.listOrders({
      query: query || undefined,
      status: status ?? undefined,
      serviceType: serviceType ?? undefined,
    }));
  }, [query, status, serviceType]);

  React.useEffect(() => { refresh(); }, [refresh]);

  function loadProfiles(customerId: string) {
    if (customerId) setProfiles(ordersStore.listMeasurementProfiles(customerId));
    else setProfiles([]);
  }

  function handleCreate() {
    const price =
      form.serviceType === "tshirt_printing"
        ? form.tshirt.customerPrice
        : form.serviceType === "wholesale" || form.serviceType === "uniform"
          ? (parseFloat(form.unitPrice) || 0) * (parseInt(form.quantity, 10) || 1)
          : parseFloat(form.price) || 0;

    const result = ordersStore.createOrder({
      customerId: form.customerId,
      serviceType: form.serviceType,
      deliveryDate: form.deliveryDate || null,
      price,
      discount: parseFloat(form.discount) || 0,
      advance: parseFloat(form.advance) || 0,
      notes: form.notes || null,
      materialDetails: form.materialDetails || null,
      customerSuppliedMaterial: form.customerSuppliedMaterial,
      shopSuppliedMaterial: form.shopSuppliedMaterial,
      measurements: form.measurements,
      measurementProfileId: form.measurementProfileId || null,
      externalMaterialCost: parseFloat(form.externalMaterialCost) || 0,
      quantity: parseInt(form.quantity, 10) || 1,
      unitPrice: parseFloat(form.unitPrice) || undefined,
      bulkDiscount: parseFloat(form.bulkDiscount) || 0,
      tshirt: form.serviceType === "tshirt_printing" ? form.tshirt : null,
    });

    if (result.errors.length || !result.order) {
      setError(result.errors.join("; ") || "Failed to create order");
      return;
    }

    // Save measurement profile for reuse
    if (form.customerId && form.measurements && Object.keys(form.measurements).length > 0) {
      ordersStore.saveMeasurementProfile({
        customerId: form.customerId,
        label: "From " + result.order.orderNumber,
        fields: form.measurements,
      });
    }

    setCreateOpen(false);
    setForm(emptyOrderForm());
    setError(null);
    refresh();
    setSelected(result.order);
  }

  function handleStatus(status: OrderStatus) {
    if (!selected) return;
    const res = ordersStore.updateOrderStatus(selected.id, status);
    if (res.order) {
      setSelected(res.order);
      refresh();
    }
  }

  function handleExpense(description: string, amount: number) {
    if (!selected || !description || amount <= 0) return;
    const res = ordersStore.addOrderExpense(selected.id, description, amount);
    if (res.order) {
      setSelected({ ...res.order });
      refresh();
    }
  }

  return (
    <>
      {!selected && (
        <OrderList
          orders={orders}
          onAdd={() => { setForm(emptyOrderForm()); setCreateOpen(true); }}
          onSearch={setQuery}
          onFilterStatus={setStatus}
          onFilterType={setServiceType}
          onSelect={setSelected}
        />
      )}
      {selected && (
        <OrderDetail
          order={selected}
          onStatusChange={handleStatus}
          onAddExpense={handleExpense}
          onClose={() => setSelected(null)}
        />
      )}
      <Modal
        open={createOpen}
        title="New Service Order"
        onClose={() => setCreateOpen(false)}
        className="max-w-2xl"
      >
        <OrderForm
          customers={customers}
          profiles={profiles}
          value={form}
          onChange={setForm}
          onLoadProfiles={loadProfiles}
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
          error={error}
        />
      </Modal>
    </>
  );
}
