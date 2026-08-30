/**
 * Desktop dashboard — live domain metrics (shared with web logic).
 */
import {
  shapeDashboardStats,
  collectLiveDashboardMetrics,
  store,
  ordersStore,
} from "@minarvabiz/business-logic";
import { formatMoney } from "@minarvabiz/utils";

export async function fetchDashboardData() {
  const metrics = collectLiveDashboardMetrics();
  const shaped = shapeDashboardStats(metrics);
  const recentOrders = ordersStore.listOrders().slice(0, 6).map((o) => ({
    id: o.id,
    orderNo: o.orderNumber,
    customer: o.customerName || "—",
    type: String(o.serviceType),
    status: o.status === "ready_to_deliver" ? "ready" : o.status,
    dueDate: o.deliveryDate || "—",
  }));
  const lowStock = store
    .listProducts()
    .filter((p) => p.stockQuantity <= p.minimumStock)
    .slice(0, 5)
    .map((p) => ({ id: p.id, name: p.name, stock: p.stockQuantity, unit: p.unit }));

  return {
    stats: shaped.stats,
    salesSeries: store.listSales().slice(0, 7).reverse().map((s, i) => ({
      label: `D${i + 1}`,
      value: s.total,
    })),
    businessSummary: shaped.businessSummary,
    netProfit: shaped.netProfit,
    orderStatus: shaped.orderStatus,
    categories: [
      { id: "1", label: "Live sales", value: formatMoney(metrics.productSalesToday), percent: 100, color: "bg-violet-500" },
    ],
    recentOrders,
    lowStock,
  };
}
