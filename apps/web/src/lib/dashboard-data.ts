/**
 * Dashboard data provider — live domain metrics + reference layout fillers.
 */

import {
  shapeDashboardStats,
  collectLiveDashboardMetrics,
  store,
  ordersStore,
} from "@minarvabiz/business-logic";
import type { DashboardData } from "@minarvabiz/ui";
import { formatMoney } from "@minarvabiz/utils";

export async function fetchDashboardData(): Promise<DashboardData> {
  const metrics = collectLiveDashboardMetrics();
  const shaped = shapeDashboardStats(metrics);

  const products = store.listProducts();
  const lowStock = products
    .filter((p) => p.stockQuantity <= p.minimumStock)
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      name: p.name,
      stock: p.stockQuantity,
      unit: p.unit,
    }));

  const recentOrders = ordersStore
    .listOrders()
    .slice(0, 6)
    .map((o) => ({
      id: o.id,
      orderNo: o.orderNumber,
      customer: o.customerName || "—",
      type: o.serviceType.replace(/_/g, " "),
      status: (o.status === "ready_to_deliver" ? "ready" : o.status === "cancelled" ? "cancelled" : o.status) as "pending" | "processing" | "ready" | "delivered" | "cancelled",
      dueDate: o.deliveryDate
        ? new Date(o.deliveryDate).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "—",
    }));

  // Category breakdown from product sales items when available
  const sales = store.listSales();
  const byCat = new Map<string, number>();
  for (const s of sales) {
    for (const item of s.items) {
      const key = item.productName;
      byCat.set(key, (byCat.get(key) || 0) + item.lineTotal);
    }
  }
  const catEntries = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const catTotal = catEntries.reduce((a, [, v]) => a + v, 0) || 1;
  const colors = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-orange-400", "bg-slate-400"];
  const categories =
    catEntries.length > 0
      ? catEntries.map(([label, value], i) => ({
          id: String(i + 1),
          label,
          value: formatMoney(value),
          percent: Math.round((value / catTotal) * 100),
          color: colors[i % colors.length],
        }))
      : [
          { id: "1", label: "No sales yet", value: formatMoney(0), percent: 0, color: "bg-slate-300" },
        ];

  // Simple sparkline from last sales (pad if empty)
  const seriesValues = sales.slice(0, 7).reverse().map((s) => s.total);
  while (seriesValues.length < 7) seriesValues.unshift(0);
  const salesSeries = seriesValues.map((value, i) => ({
    label: `D${i + 1}`,
    value,
  }));

  return {
    stats: shaped.stats,
    salesSeries,
    businessSummary: shaped.businessSummary,
    netProfit: shaped.netProfit,
    orderStatus: shaped.orderStatus,
    categories,
    recentOrders:
      recentOrders.length > 0
        ? recentOrders
        : [
            {
              id: "0",
              orderNo: "—",
              customer: "No orders yet",
              type: "—",
              status: "pending",
              dueDate: "—",
            },
          ],
    lowStock: lowStock.length
      ? lowStock
      : [],
  };
}
