/**
 * Desktop dashboard — live domain metrics (shared with web logic).
 */
import {
  shapeDashboardStats,
  collectLiveDashboardMetrics,
  getProductionControlSnapshot,
  getCustomerIntelligenceSnapshot,
  store,
  ordersStore,
  phase6Store,
} from "@minarvabiz/business-logic";
import { formatMoney } from "@minarvabiz/utils";
import type { DashboardData } from "@minarvabiz/ui";
import type { RecentOrderRow } from "@minarvabiz/ui";

const toStatusBadge = (status: string): RecentOrderRow["status"] => {
  switch (status) {
    case "ready_to_deliver": return "ready";
    case "pending": return "pending";
    case "processing": return "processing";
    case "delivered": return "delivered";
    case "cancelled": return "cancelled";
    default: return "pending";
  }
};

export async function fetchDashboardData(): Promise<DashboardData> {
  const metrics = collectLiveDashboardMetrics();
  const shaped = shapeDashboardStats(metrics);
  const serviceOrders = ordersStore.listOrders();
  const sales = store.listSales();
  const recentOrders: RecentOrderRow[] = serviceOrders.slice(0, 6).map((o) => ({
    id: o.id,
    orderNo: o.orderNumber,
    customer: o.customerName || "—",
    type: String(o.serviceType),
    status: toStatusBadge(String(o.status)),
    dueDate: o.deliveryDate || "—",
  }));
  const lowStock = store
    .listProducts()
    .filter((p) => p.stockQuantity <= p.minimumStock)
    .slice(0, 5)
    .map((p) => ({ id: p.id, name: p.name, stock: p.stockQuantity, unit: p.unit }));
  const productionControl = getProductionControlSnapshot(
    serviceOrders,
    phase6Store.listStaff(),
    phase6Store.listAssignments()
  );
  const intelligence = getCustomerIntelligenceSnapshot(
    store.listCustomers().map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone ?? null,
      createdAt: customer.createdAt,
    })),
    [
      ...serviceOrders.map((order) => ({
        customerId: order.customerId,
        total: Math.max(0, order.price - order.discount),
        paid: order.advance,
        date: order.orderDate || order.createdAt,
        profit: order.price - order.discount - order.externalMaterialCost - order.orderExpensesTotal,
        status: order.status,
        cancelled: order.status === "cancelled" || Boolean(order.deletedAt),
      })),
      ...sales.map((sale) => ({
        customerId: sale.customerId || "",
        total: sale.total,
        paid: sale.paidAmount,
        date: sale.saleDate || sale.createdAt,
        profit: sale.items.reduce((sum, item) => sum + ((item.unitPrice * item.quantity) - (item.costPrice * item.quantity)), 0) - sale.discountAmount,
        cancelled: ["cancelled", "returned", "draft"].includes(sale.status) || Boolean(sale.deletedAt),
      })),
    ]
  );

  return {
    stats: shaped.stats,
    salesSeries: sales.slice(0, 7).reverse().map((s, i) => ({ label: `D${i + 1}`, value: s.total })),
    businessSummary: shaped.businessSummary,
    netProfit: shaped.netProfit,
    orderStatus: shaped.orderStatus,
    categories: [
      { id: "1", label: "Live sales", value: formatMoney(metrics.productSalesToday), percent: 100, color: "bg-violet-500" },
    ],
    recentOrders,
    lowStock,
    productionControl,
    customerIntelligence: {
      totalCustomers: intelligence.customers.length,
      highRiskCount: intelligence.highRiskCount,
      followUpCount: intelligence.followUpCount,
      estimatedAnnualValue: intelligence.totalCustomerValue,
      topCustomers: intelligence.customers.slice(0, 5).map((customer) => ({
        customerId: customer.customerId,
        customerName: customer.customerName,
        totalSpend: customer.totalSpend,
        loyaltyScore: customer.loyaltyScore,
        segment: customer.segment,
        churnRisk: customer.churnRisk,
        followUp: customer.followUp,
      })),
    },
  };
}
