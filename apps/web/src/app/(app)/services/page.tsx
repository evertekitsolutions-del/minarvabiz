"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseServiceOrderPriceDraft } from "@/lib/service-order-price-draft";
import {
  OrderList, OrderForm, emptyOrderForm, OrderDetail, Modal, Button, FormField, inputClass,
  type OrderFormValues,
} from "@minarvabiz/ui";
import { store, ordersStore, phase5Store, phase6Store, phase7Store, printOrderReceipt, templateFromOrderReady, assertLimit } from "@minarvabiz/business-logic";
import { customerSchema } from "@minarvabiz/validation";
import type {
  ServiceOrder, Customer, ExpenseCategory, MeasurementProfile, PaymentMethod, ServiceType, OrderStatus,
} from "@minarvabiz/types";

const emptyCustomerForm = { name: "", phone: "", email: "", address: "", notes: "" };

export default function ServicesOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = React.useState<ServiceOrder[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [profiles, setProfiles] = React.useState<MeasurementProfile[]>([]);
  const [expenseCategories, setExpenseCategories] = React.useState<ExpenseCategory[]>([]);
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<OrderStatus | null>(null);
  const [serviceType, setServiceType] = React.useState<ServiceType | null>(null);
  const [customerId, setCustomerId] = React.useState<string | null>(null);
  const [orderDateFrom, setOrderDateFrom] = React.useState("");
  const [orderDateTo, setOrderDateTo] = React.useState("");
  const [deliveryDateFrom, setDeliveryDateFrom] = React.useState("");
  const [deliveryDateTo, setDeliveryDateTo] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [customerQuickAddOpen, setCustomerQuickAddOpen] = React.useState(false);
  const [customerForm, setCustomerForm] = React.useState(emptyCustomerForm);
  const [customerAddError, setCustomerAddError] = React.useState<string | null>(null);
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
      customerId: customerId ?? undefined,
      orderDateFrom: orderDateFrom || undefined,
      orderDateTo: orderDateTo || undefined,
      deliveryDateFrom: deliveryDateFrom || undefined,
      deliveryDateTo: deliveryDateTo || undefined,
    }));
  }, [query, status, serviceType, customerId, orderDateFrom, orderDateTo, deliveryDateFrom, deliveryDateTo]);

  React.useEffect(() => { refresh(); }, [refresh]);

  function openCustomerQuickAdd() {
    setCustomerAddError(null);
    setCustomerQuickAddOpen(true);
  }

  function closeCustomerQuickAdd() {
    setCustomerQuickAddOpen(false);
    setCustomerAddError(null);
  }

  function saveCustomerForOrder() {
    const parsed = customerSchema.safeParse({
      name: customerForm.name,
      phone: customerForm.phone || null,
      email: customerForm.email || null,
      address: customerForm.address || null,
      notes: customerForm.notes || null,
    });
    if (!parsed.success) {
      setCustomerAddError(parsed.error.errors[0]?.message ?? "Invalid customer details");
      return;
    }
    try {
      const limit = assertLimit("customers");
      if (!limit.allowed) throw new Error(limit.reason ?? "Customer limit reached");
      const customer = store.createCustomer(parsed.data);
      // Preserve entered order price, tailoring type, material and measurement drafts.
      setForm((current) => ({
        ...current,
        customerId: customer.id,
        measurementProfileId: "",
        measurements: {},
      }));
      setProfiles([]);
      refresh();
      setCustomerQuickAddOpen(false);
      setCustomerForm(emptyCustomerForm);
      setCustomerAddError(null);
    } catch (error) {
      setCustomerAddError(error instanceof Error ? error.message : "Unable to create customer");
    }
  }

  function loadProfiles(customerId: string) {
    if (customerId) setProfiles(ordersStore.listMeasurementProfiles(customerId));
    else setProfiles([]);
  }

  function handleCreate() {
    let result: ReturnType<typeof ordersStore.createOrder>;
    try {
      const pricing = parseServiceOrderPriceDraft(form);
      result = ordersStore.createOrder({
        customerId: form.customerId,
        serviceType: form.serviceType,
        deliveryDate: form.deliveryDate || null,
        price: pricing.price,
        discount: pricing.discount,
        advance: pricing.advance,
        advancePaymentMethod: form.advancePaymentMethod,
        notes: form.notes || null,
        materialDetails: form.materialDetails || null,
        customerSuppliedMaterial: form.customerSuppliedMaterial,
        shopSuppliedMaterial: form.shopSuppliedMaterial,
        measurements: form.measurements,
        measurementProfileId: form.measurementProfileId || null,
        externalMaterialCost: pricing.externalMaterialCost,
        quantity: pricing.quantity,
        unitPrice: pricing.unitPrice,
        bulkDiscount: pricing.bulkDiscount,
        tshirt: form.serviceType === "tshirt_printing"
          ? { ...form.tshirt, customerPrice: pricing.price }
          : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create service order.");
      return;
    }
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

  function handleStatus(status: OrderStatus, options?: { refundPaymentMethod?: PaymentMethod; reason?: string }) {
    if (!selected) return;
    const res = ordersStore.updateOrderStatus(selected.id, status, options);
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

  function handleOperationalUpdate(
    input: { deliveryDate: string | null; notes: string | null; materialDetails: string | null },
    reason: string
  ) {
    if (!selected) return;
    const result = ordersStore.updateOrderOperationalDetails(selected.id, input, reason);
    if (result.errors.length || !result.order) {
      setStatusError(result.errors.join("; ") || "Unable to update service order");
      return;
    }
    setStatusError(null);
    setSelected({ ...result.order });
    refresh();
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
          customers={customers}
          onAdd={() => { setForm(emptyOrderForm()); setCreateOpen(true); }}
          onSearch={setQuery}
          onFilterStatus={setStatus}
          onFilterType={setServiceType}
          onFilterCustomer={setCustomerId}
          onFilterOrderDateFrom={setOrderDateFrom}
          onFilterOrderDateTo={setOrderDateTo}
          onFilterDeliveryDateFrom={setDeliveryDateFrom}
          onFilterDeliveryDateTo={setDeliveryDateTo}
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
          onCollectBalance={(order) => router.push(`/payments?customerId=${encodeURIComponent(order.customerId)}`)}
          onUpdateOperationalDetails={handleOperationalUpdate}
          auditHistory={phase7Store.listAuditLogs(500).filter((entry) => entry.tableName === "orders" && entry.recordId === selected.id)}
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
          onAddCustomer={openCustomerQuickAdd}
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
          error={error}
        />
      </Modal>
      <Modal
        open={customerQuickAddOpen}
        title="Add Customer for Service Order"
        onClose={closeCustomerQuickAdd}
        footer={<>
          <Button variant="outline" onClick={closeCustomerQuickAdd}>Cancel</Button>
          <Button onClick={saveCustomerForOrder}>Save & Select Customer</Button>
        </>}
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-600">The service order draft will remain open. The new customer will be selected automatically.</p>
          <FormField label="Name *"><input autoFocus className={inputClass} value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} /></FormField>
          <FormField label="Phone"><input className={inputClass} value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} /></FormField>
          <FormField label="Email"><input className={inputClass} type="email" value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} /></FormField>
          <FormField label="Address"><input className={inputClass} value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })} /></FormField>
          <FormField label="Notes"><textarea className={inputClass + " h-20 py-2"} value={customerForm.notes} onChange={(event) => setCustomerForm({ ...customerForm, notes: event.target.value })} /></FormField>
          {customerAddError && <p role="alert" className="text-sm text-rose-700">{customerAddError}</p>}
        </div>
      </Modal>
    </>
  );
}
