/**
 * Build RawDashboardMetrics from live in-memory domain stores.
 */

import {
  addMinorUnits,
  fromMinorUnits,
  multiplyMinorByQuantity,
  toMinorUnits,
} from "@minarvabiz/utils";
import type { RawDashboardMetrics } from "./dashboard";
import * as store from "./store";
import * as ordersStore from "./orders-store";
import * as phase5Store from "./phase5-store";
import * as phase6Store from "./phase6-store";
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

function sumMoney(values: number[]): number {
  const totalMinor = values.reduce(
    (sum, value) => addMinorUnits(sum, toMinorUnits(value)),
    0,
  );
  return fromMinorUnits(totalMinor);
}

export function collectLiveDashboardMetrics(): RawDashboardMetrics {
  const today = todayKey();
  const yesterday = yesterdayKey();

  const sales = store.listSales().filter((s) => s.status === "completed" || s.status === "partial");
  const salesToday = sales.filter((s) => dayKey(s.saleDate) === today);
  const salesYest = sales.filter((s) => dayKey(s.saleDate) === yesterday);

  const productSalesToday = sumMoney(salesToday.map((sale) => sale.total));
  const productSalesYesterday = sumMoney(salesYest.map((sale) => sale.total));
  const costOfGoodsTodayMinor = salesToday.reduce(
    (saleTotalMinor, sale) => addMinorUnits(
      saleTotalMinor,
      sale.items.reduce(
        (itemTotalMinor, item) => addMinorUnits(
          itemTotalMinor,
          multiplyMinorByQuantity(toMinorUnits(item.costPrice), item.quantity),
        ),
        0,
      ),
    ),
    0,
  );
  const costOfGoodsToday = fromMinorUnits(costOfGoodsTodayMinor);

  const orders = ordersStore.listOrders().filter((o) => o.status !== "cancelled");
  const ordersToday = orders.filter((o) => dayKey(o.orderDate) === today);
  const ordersYest = orders.filter((o) => dayKey(o.orderDate) === yesterday);
  const serviceRevenueToday = sumMoney(ordersToday.map((order) => order.price));
  const serviceRevenueYesterday = sumMoney(ordersYest.map((order) => order.price));
  const orderMaterialCostsToday = sumMoney(ordersToday.map((order) => order.externalMaterialCost));
  const orderSpecificExpensesToday = sumMoney(ordersToday.map((order) => order.orderExpensesTotal));

  const laundry = phase5Store.listLaundryOrders().filter((l) => l.status !== "cancelled");
  const laundryToday = laundry.filter((l) => dayKey(l.createdAt) === today);
  const laundryYest = laundry.filter((l) => dayKey(l.createdAt) === yesterday);
  const laundryRevenueToday = sumMoney(laundryToday.map((item) => item.totalCustomerCharge));
  const laundryRevenueYesterday = sumMoney(laundryYest.map((item) => item.totalCustomerCharge));
  const laundrySupplierCostToday = sumMoney(laundryToday.map((item) => item.totalSupplierCost));

  const expenses = phase5Store.listExpenses();
  const expensesTodayList = expenses.filter((e) => dayKey(e.date) === today);
  const generalExpensesToday = sumMoney(expensesTodayList.filter((e) => !e.orderId).map((expense) => expense.amount));
  const expensesToday = sumMoney(expensesTodayList.map((expense) => expense.amount));

  const staffIncentivesToday = sumMoney(
    phase6Store
      .listIncentivePayouts()
      .filter((p) => dayKey(p.calculatedAt) === today)
      .map((payout) => payout.amount),
  );

  const pendingOrders = orders.filter((o) => o.status === "pending").length;
  const processingOrders = orders.filter((o) => o.status === "processing").length;
  const readyOrders = orders.filter((o) => o.status === "ready_to_deliver").length;
  const deliveredOrders = orders.filter((o) => o.status === "delivered").length;

  const products = store.listProducts();
  const lowStockCount = products.filter((p) => isLowStock(p.stockQuantity, p.minimumStock)).length;
  const outstandingPayments = sumMoney(
    store.listCustomers()
      .map((customer) => customer.outstandingBalance)
      .filter((amount) => amount > 0),
  );

  return {
    productSalesToday,
    serviceRevenueToday,
    laundryRevenueToday,
    laundrySupplierCostToday,
    expensesToday,
    productSalesYesterday,
    serviceRevenueYesterday,
    laundryRevenueYesterday,
    costOfGoodsToday,
    orderMaterialCostsToday,
    orderSpecificExpensesToday,
    generalExpensesToday,
    staffIncentivesToday,
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
