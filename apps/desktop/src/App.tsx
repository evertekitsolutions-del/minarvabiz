"use client";

import * as React from "react";
import {
  AppShell, Dashboard, CustomerList, ProductList, PosBilling, SalesList,
  Modal, Button, FormField, inputClass,
  type QuickAction, type NavItemId, type DashboardData,
} from "@minarvabiz/ui";
import { store } from "@minarvabiz/business-logic";
import type { Customer, Product, Category, Sale, CartLine, PaymentMethod } from "@minarvabiz/types";
import { fetchDashboardData } from "./lib/dashboard-data";

export function App() {
  const [activeNav, setActiveNav] = React.useState<NavItemId>("dashboard");
  const [dash, setDash] = React.useState<DashboardData | null>(null);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [sales, setSales] = React.useState<Sale[]>([]);
  const [salesTab, setSalesTab] = React.useState<"pos" | "history">("pos");
  const [custOpen, setCustOpen] = React.useState(false);
  const [custForm, setCustForm] = React.useState({ name: "", phone: "", email: "" });
  const [lowStockOnly, setLowStockOnly] = React.useState(false);

  const refreshAll = React.useCallback(() => {
    setCustomers(store.listCustomers());
    setProducts(store.listProducts({ lowStockOnly }));
    setCategories(store.listCategories());
    setSales(store.listSales());
  }, [lowStockOnly]);

  React.useEffect(() => {
    fetchDashboardData().then(setDash);
    refreshAll();
  }, [refreshAll]);

  const actions: QuickAction[] = [
    {
      id: "sale", label: "New Sale", description: "Create Invoice", icon: <span>🛒</span>, tone: "blue",
      onClick: () => { setActiveNav("sales"); setSalesTab("pos"); },
    },
    {
      id: "customer", label: "Customer", description: "Add New", icon: <span>👤</span>, tone: "indigo",
      onClick: () => { setActiveNav("customers"); setCustOpen(true); },
    },
  ];

  function handleSale(payload: {
    customerId: string | null; lines: CartLine[]; paidAmount: number; paymentMethod: PaymentMethod;
  }) {
    const result = store.createSale(payload);
    if (result.errors.length) return { success: false, errors: result.errors };
    refreshAll();
    return { success: true, invoiceNumber: result.sale.invoiceNumber };
  }

  const titleMap: Partial<Record<NavItemId, string>> = {
    dashboard: "Dashboard",
    customers: "Customers",
    sales: "Sales & Billing",
  };

  return (
    <AppShell
      activeNav={activeNav}
      onNavigate={(_h, id) => setActiveNav(id)}
      sidebar={{ user: { name: "Admin", role: "Super Admin" }, logoSrc: "/logo.png" }}
      header={{
        title: titleMap[activeNav] ?? activeNav,
        subtitle: "Welcome back, Admin!",
        notificationCount: 6,
        messageCount: 3,
      }}
    >
      {activeNav === "dashboard" && dash && <Dashboard data={dash} quickActions={actions} />}

      {activeNav === "customers" && (
        <>
          <CustomerList
            customers={customers}
            onAdd={() => setCustOpen(true)}
            onSearch={(q) => setCustomers(store.listCustomers(q))}
          />
          <Modal
            open={custOpen}
            title="Add Customer"
            onClose={() => setCustOpen(false)}
            footer={
              <>
                <Button variant="outline" onClick={() => setCustOpen(false)}>Cancel</Button>
                <Button onClick={() => { store.createCustomer(custForm); setCustOpen(false); refreshAll(); }}>Save</Button>
              </>
            }
          >
            <div className="space-y-3">
              <FormField label="Name">
                <input className={inputClass} value={custForm.name} onChange={(e) => setCustForm({ ...custForm, name: e.target.value })} />
              </FormField>
              <FormField label="Phone">
                <input className={inputClass} value={custForm.phone} onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })} />
              </FormField>
              <FormField label="Email">
                <input className={inputClass} value={custForm.email} onChange={(e) => setCustForm({ ...custForm, email: e.target.value })} />
              </FormField>
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
            <PosBilling
              products={products}
              customers={customers}
              onCompleteSale={handleSale}
              onFindByBarcode={(c) => store.getProductByBarcode(c)}
            />
          )}
          {salesTab === "history" && <SalesList sales={sales} />}
        </div>
      )}

      {/* Map inventory-like nav to product list for desktop */}
      {(activeNav as string) !== "dashboard" &&
        activeNav !== "customers" &&
        activeNav !== "sales" && (
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
