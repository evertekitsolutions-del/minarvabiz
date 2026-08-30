"use client";

import * as React from "react";
import {
  AppShell, Dashboard, CustomerList, ProductList, PosBilling, SalesList,
  OrderList, OrderForm, emptyOrderForm, OrderDetail,
  Modal, Button, FormField, inputClass,
  type QuickAction, type NavItemId, type DashboardData, type OrderFormValues,
} from "@minarvabiz/ui";
import { store, ordersStore } from "@minarvabiz/business-logic";
import type {
  Customer, Product, Category, Sale, CartLine, PaymentMethod,
  ServiceOrder, MeasurementProfile, ServiceType, OrderStatus,
} from "@minarvabiz/types";
import { fetchDashboardData } from "./lib/dashboard-data";
import { bootstrapDesktopSqlite, isDesktopSqliteReady, getDesktopSqliteError } from "./lib/sqlite-bootstrap";

export function App() {
  const [dbReady, setDbReady] = React.useState(false);
  const [dbError, setDbError] = React.useState<string | null>(null);
  const [activeNav, setActiveNav] = React.useState<NavItemId>("dashboard");
  const [dash, setDash] = React.useState<DashboardData | null>(null);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [sales, setSales] = React.useState<Sale[]>([]);
  const [salesTab, setSalesTab] = React.useState<"pos" | "history">("pos");
  const [orders, setOrders] = React.useState<ServiceOrder[]>([]);
  const [profiles, setProfiles] = React.useState<MeasurementProfile[]>([]);
  const [orderQuery, setOrderQuery] = React.useState("");
  const [orderStatus, setOrderStatus] = React.useState<OrderStatus | null>(null);
  const [orderType, setOrderType] = React.useState<ServiceType | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState<OrderFormValues>(emptyOrderForm());
  const [formError, setFormError] = React.useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = React.useState<ServiceOrder | null>(null);
  const [custOpen, setCustOpen] = React.useState(false);
  const [custForm, setCustForm] = React.useState({ name: "", phone: "", email: "" });
  const [lowStockOnly, setLowStockOnly] = React.useState(false);

  const refreshAll = React.useCallback(() => {
    setCustomers(store.listCustomers());
    setProducts(store.listProducts({ lowStockOnly }));
    setCategories(store.listCategories());
    setSales(store.listSales());
    setOrders(ordersStore.listOrders({
      query: orderQuery || undefined,
      status: orderStatus ?? undefined,
      serviceType: orderType ?? undefined,
    }));
  }, [lowStockOnly, orderQuery, orderStatus, orderType]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await bootstrapDesktopSqlite();
      if (cancelled) return;
      if (!result.ok) {
        setDbError(result.error || "SQLite failed to initialize");
        setDbReady(false);
        return;
      }
      setDbReady(true);
      fetchDashboardData().then(setDash);
      refreshAll();
    })();
    return () => { cancelled = true; };
  }, [refreshAll]);

  if (dbError) {
    return (
      <div style={{ padding: 32, fontFamily: "system-ui", maxWidth: 560 }}>
        <h1 style={{ color: "#b91c1c" }}>Database required</h1>
        <p>Minarva Biz Offline cannot start without SQLite.</p>
        <pre style={{ background: "#fef2f2", padding: 12, borderRadius: 8 }}>{dbError}</pre>
        <p style={{ fontSize: 13, color: "#64748b" }}>
          Path: userData/minarvabiz.db · MINARVA_MODE=production · localStorage is not used for business data.
        </p>
      </div>
    );
  }

  if (!dbReady) {
    return (
      <div style={{ padding: 48, fontFamily: "system-ui", textAlign: "center" }}>
        <p>Initializing SQLite database…</p>
      </div>
    );
  }

  const actions: QuickAction[] = [
    { id: "sale", label: "New Sale", description: "Create Invoice", icon: <span>🛒</span>, tone: "blue",
      onClick: () => { setActiveNav("sales"); setSalesTab("pos"); } },
    { id: "order", label: "New Order", description: "Tailoring Order", icon: <span>👗</span>, tone: "pink",
      onClick: () => { setActiveNav("services"); setCreateOpen(true); } },
  ];

  function handleSale(payload: {
    customerId: string | null; lines: CartLine[]; paidAmount: number; paymentMethod: PaymentMethod;
  }) {
    const result = store.createSale(payload);
    if (result.errors.length) return { success: false, errors: result.errors };
    refreshAll();
    return { success: true, invoiceNumber: result.sale.invoiceNumber };
  }

  function handleCreateOrder() {
    const price =
      form.serviceType === "tshirt_printing" ? form.tshirt.customerPrice
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
      setFormError(result.errors.join("; ") || "Failed");
      return;
    }
    if (form.customerId && Object.keys(form.measurements).length > 0) {
      ordersStore.saveMeasurementProfile({
        customerId: form.customerId,
        label: "From " + result.order.orderNumber,
        fields: form.measurements,
      });
    }
    setCreateOpen(false);
    setForm(emptyOrderForm());
    setFormError(null);
    refreshAll();
    setSelectedOrder(result.order);
  }

  return (
    <AppShell
      activeNav={activeNav}
      onNavigate={(_h, id) => { setActiveNav(id); setSelectedOrder(null); }}
      sidebar={{ user: { name: "Admin", role: "Super Admin" }, logoSrc: "/logo-mark.png" }}
      header={{
        showSearch: activeNav !== "dashboard",
        title: activeNav === "services" ? "Services & Orders" : activeNav,
        subtitle: "Welcome back, Admin!",
        notificationCount: 6,
        messageCount: 3,
      }}
    >
      {activeNav === "dashboard" && dash && <Dashboard data={dash} quickActions={actions} />}

      {activeNav === "customers" && (
        <>
          <CustomerList customers={customers} onAdd={() => setCustOpen(true)}
            onSearch={(q) => setCustomers(store.listCustomers(q))} />
          <Modal open={custOpen} title="Add Customer" onClose={() => setCustOpen(false)}
            footer={<><Button variant="outline" onClick={() => setCustOpen(false)}>Cancel</Button>
              <Button onClick={() => { store.createCustomer(custForm); setCustOpen(false); refreshAll(); }}>Save</Button></>}>
            <div className="space-y-3">
              <FormField label="Name"><input className={inputClass} value={custForm.name} onChange={(e) => setCustForm({ ...custForm, name: e.target.value })} /></FormField>
              <FormField label="Phone"><input className={inputClass} value={custForm.phone} onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })} /></FormField>
            </div>
          </Modal>
        </>
      )}

      {activeNav === "sales" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button variant={salesTab === "pos" ? "primary" : "outline"} onClick={() => setSalesTab("pos")}>New Sale</Button>
            <Button variant={salesTab === "history" ? "primary" : "outline"} onClick={() => setSalesTab("history")}>History</Button>
          </div>
          {salesTab === "pos" && (
            <PosBilling products={products} customers={customers} onCompleteSale={handleSale}
              onFindByBarcode={(c) => store.getProductByBarcode(c)} />
          )}
          {salesTab === "history" && <SalesList sales={sales} />}
        </div>
      )}

      {activeNav === "services" && (
        <>
          {!selectedOrder && (
            <OrderList
              orders={orders}
              onAdd={() => { setForm(emptyOrderForm()); setCreateOpen(true); }}
              onSearch={setOrderQuery}
              onFilterStatus={setOrderStatus}
              onFilterType={setOrderType}
              onSelect={setSelectedOrder}
            />
          )}
          {selectedOrder && (
            <OrderDetail
              order={selectedOrder}
              onStatusChange={(s) => {
                const res = ordersStore.updateOrderStatus(selectedOrder.id, s);
                if (res.order) { setSelectedOrder(res.order); refreshAll(); }
              }}
              onAddExpense={(d, a) => {
                const res = ordersStore.addOrderExpense(selectedOrder.id, d, a);
                if (res.order) { setSelectedOrder({ ...res.order }); refreshAll(); }
              }}
              onClose={() => setSelectedOrder(null)}
            />
          )}
          <Modal open={createOpen} title="New Service Order" onClose={() => setCreateOpen(false)} className="max-w-2xl">
            <OrderForm
              customers={customers}
              profiles={profiles}
              value={form}
              onChange={setForm}
              onLoadProfiles={(id) => setProfiles(id ? ordersStore.listMeasurementProfiles(id) : [])}
              onSubmit={handleCreateOrder}
              onCancel={() => setCreateOpen(false)}
              error={formError}
            />
          </Modal>
        </>
      )}

      {activeNav !== "dashboard" && activeNav !== "customers" && activeNav !== "sales" && activeNav !== "services" && (
        <ProductList
          products={products}
          categories={categories}
          lowStockOnly={lowStockOnly}
          onToggleLowStock={() => setLowStockOnly((v) => !v)}
          onSearch={(q) => setProducts(store.listProducts({ query: q, lowStockOnly }))}
        />
      )}
    </AppShell>
  );
}
