"use client";

import * as React from "react";
import Link from "next/link";
import {
  OrderList, OrderForm, emptyOrderForm, OrderDetail, Modal,
  type OrderFormValues,
} from "@minarvabiz/ui";
import { store, ordersStore, phase5Store, printOrderReceipt, phase6Store, templateFromOrderReady } from "@minarvabiz/business-logic";
import type {
  ServiceOrder, Customer, ExpenseCategory, MeasurementProfile, PaymentMethod, ServiceType, OrderStatus,
} from "@minarvabiz/types";

export default function ServicesOrdersPage() {
  const [orders, setOrders] = React.useState<ServiceOrder[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [profiles, setProfiles] = React.useState<MeasurementProfile[]>([]);
  const [expenseCategories, setExpenseCategories] = React.useState<ExpenseCategory[]>([]);
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<OrderStatus | null>(null);
  const [serviceType, setServiceType] = React.useState<ServiceType | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState<OrderFormValues>(emptyOrderForm());
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<ServiceOrder | null>(null);
  const [statusError, setStatusError] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    setCustomers(store.listCustomers());
    setExpenseCategories(phase5Store.listExpenseCategories());
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
    try { printOrderReceipt(result.order); } catch { /* blocked */ }
  }

  function handleStatus(status: OrderStatus) {
    if (!selected) return;
    const res = ordersStore.updateOrderStatus(selected.id, status);
    if (!res.order) {
      setStatusError(res.error ?? "Unable to update service order status");
      return;
    }
    setStatusError(null);
    if (res.order) {
      setSelected(res.order);
      if (status === "ready_to_deliver") {
        const msg = templateFromOrderReady(res.order);
        phase6Store.pushNotification({
          kind: "order_ready",
          title: msg.title,
          body: msg.body,
          href: "/services",
        });
      }
      refresh();
    }
  }

  function handleExpense(input: { description: string; amount: number; categoryId: string; paymentMethod: PaymentMethod }) {
    if (!selected) return;
    try {
      const res = phase5Store.createExpense({
        categoryId: input.categoryId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        description: input.description || null,
        orderId: selected.id,
      });
      if (res.errors.length || !res.expense) {
        setStatusError(res.errors.join("; ") || "Unable to record order expense");
        return;
      }
      const updated = ordersStore.getOrder(selected.id);
      if (updated) setSelected({ ...updated, expenses: [...updated.expenses] });
      setStatusError(null);
      refresh();
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Unable to record order expense");
    }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Service Orders</h1>
          <p className="text-sm text-slate-500">Tailoring, alterations, wedding, bulk and printing orders.</p>
        </div>
        <Link href="/services/production" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
          Production & Materials
        </Link>
      </div>
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
        <>
          {statusError && <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{statusError}</p>}
          <OrderDetail
          order={selected}
          expenseCategories={expenseCategories}
          onStatusChange={handleStatus}
          onAddExpense={handleExpense}
          onClose={() => { setSelected(null); setStatusError(null); }}
        />
        </>
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
