/**
 * Build RawDashboardMetrics from live in-memory domain stores.
 */

import type { RawDashboardMetrics } from "./dashboard";
import * as store from "./store";
import * as ordersStore from "./orders-store";
import * as phase5Store from "./phase5-store";
import { isLowStock } from "./inventory";

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function collectLiveDashboardMetrics(): RawDashboardMetrics {
  const today = todayKey();
  const yesterday = yesterdayKey();

  const sales = store.listSales().filter((s) => s.status === "completed" || s.status === "partial");
  const salesToday = sales.filter((s) => dayKey(s.saleDate) === today);
  const salesYest = sales.filter((s) => dayKey(s.saleDate) === yesterday);

  const productSalesToday = salesToday.reduce((a, s) => a + s.total, 0);
  const productSalesYesterday = salesYest.reduce((a, s) => a + s.total, 0);
  const costOfGoodsToday = salesToday.reduce(
    (a, s) => a + s.items.reduce((x, i) => x + i.quantity * i.costPrice, 0),
    0
  );

  const orders = ordersStore.listOrders().filter((o) => o.status !== "cancelled");
  const ordersToday = orders.filter((o) => dayKey(o.orderDate) === today);
  const ordersYest = orders.filter((o) => dayKey(o.orderDate) === yesterday);
  const serviceRevenueToday = ordersToday.reduce((a, o) => a + o.price, 0);
  const serviceRevenueYesterday = ordersYest.reduce((a, o) => a + o.price, 0);
  const orderMaterialCostsToday = ordersToday.reduce((a, o) => a + o.externalMaterialCost, 0);
  const orderSpecificExpensesToday = ordersToday.reduce((a, o) => a + o.orderExpensesTotal, 0);

  const laundry = phase5Store.listLaundryOrders().filter((l) => l.status !== "cancelled");
  const laundryToday = laundry.filter((l) => dayKey(l.createdAt) === today);
  const laundryYest = laundry.filter((l) => dayKey(l.createdAt) === yesterday);
  const laundryRevenueToday = laundryToday.reduce((a, l) => a + l.totalCustomerCharge, 0);
  const laundryRevenueYesterday = laundryYest.reduce((a, l) => a + l.totalCustomerCharge, 0);

  const expenses = phase5Store.listExpenses();
  const expensesTodayList = expenses.filter((e) => dayKey(e.date) === today);
  const generalExpensesToday = expensesTodayList
    .filter((e) => !e.orderId)
    .reduce((a, e) => a + e.amount, 0);
  const expensesToday = expensesTodayList.reduce((a, e) => a + e.amount, 0);

  const pendingOrders = orders.filter((o) => o.status === "pending").length;
  const processingOrders = orders.filter((o) => o.status === "processing").length;
  const readyOrders = orders.filter((o) => o.status === "ready_to_deliver").length;
  const deliveredOrders = orders.filter((o) => o.status === "delivered").length;

  const products = store.listProducts();
  const lowStockCount = products.filter((p) => isLowStock(p.stockQuantity, p.minimumStock)).length;
  const outstandingPayments = store
    .listCustomers()
    .reduce((a, c) => a + (c.outstandingBalance > 0 ? c.outstandingBalance : 0), 0);

  return {
    productSalesToday,
    serviceRevenueToday,
    laundryRevenueToday,
    expensesToday,
    productSalesYesterday,
    serviceRevenueYesterday,
    laundryRevenueYesterday,
    costOfGoodsToday,
    orderMaterialCostsToday,
    orderSpecificExpensesToday,
    generalExpensesToday,
    staffIncentivesToday: 0,
    pendingOrders,
    processingOrders,
    readyOrders,
    deliveredOrders,
    totalCustomers: store.listCustomers().length,
    lowStockCount,
    outstandingPayments,
    currency: "INR",
  };
}
