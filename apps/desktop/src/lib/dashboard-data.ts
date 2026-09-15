/**
 * Desktop dashboard — live domain metrics (shared with web logic).
 */
import {
  shapeDashboardStats,
  collectLiveDashboardMetrics,
  getProductionControlSnapshot,
  getCustomerIntelligenceSnapshot,
  buildInventoryIntelligence,
  calculateStaffProductivity,
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
  const products = store.listProducts();
  const staff = phase6Store.listStaff();
  const assignments = phase6Store.listAssignments();

  const recentOrders: RecentOrderRow[] = serviceOrders.slice(0, 6).map((o) => ({
    id: o.id,
    orderNo: o.orderNumber,
    customer: o.customerName || "—",
    type: String(o.serviceType),
    status: toStatusBadge(String(o.status)),
    dueDate: o.deliveryDate || "—",
  }));

  const lowStock = products
    .filter((p) => p.stockQuantity <= p.minimumStock)
    .slice(0, 5)
    .map((p) => ({ id: p.id, name: p.name, stock: p.stockQuantity, unit: p.unit }));

  const productionControl = getProductionControlSnapshot(serviceOrders, staff, assignments);

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

  const now = new Date();
  const windowStart = now.getTime() - 90 * 86_400_000;
  const sold90d = new Map<string, number>();
  const lastSale = new Map<string, number>();
  for (const sale of sales) {
    const saleTime = Date.parse(sale.saleDate || sale.createdAt);
    if (!Number.isFinite(saleTime) || saleTime < windowStart || saleTime > now.getTime()) continue;
    for (const item of sale.items) {
      sold90d.set(item.productId, (sold90d.get(item.productId) ?? 0) + Math.max(0, item.quantity));
      const previous = lastSale.get(item.productId);
      if (previous == null || saleTime > previous) lastSale.set(item.productId, saleTime);
    }
  }

  const inventoryIntelligence = buildInventoryIntelligence(
    products.map((product) => {
      const last = lastSale.get(product.id);
      return {
        productId: product.id,
        name: product.name,
        sku: product.sku ?? null,
        category: product.categoryId ?? null,
        unit: product.unit,
        stockQuantity: product.stockQuantity,
        minimumStock: product.minimumStock,
        costPrice: product.costPrice,
        sellingPrice: product.sellingPrice,
        unitsSold: sold90d.get(product.id) ?? 0,
        periodDays: 90,
        leadTimeDays: 7,
        safetyStockDays: 7,
        maximumStock: null,
        daysSinceLastSale: last == null ? null : Math.max(0, (now.getTime() - last) / 86_400_000),
      };
    }),
    now.toISOString()
  );

  const staffProductivity = calculateStaffProductivity(
    staff,
    assignments.map((assignment) => ({
      ...assignment,
      dueDate: ordersStore.getOrder(assignment.orderId)?.deliveryDate ?? null,
    })),
    now
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
    inventoryIntelligence: {
      totalProducts: inventoryIntelligence.summary.totalProducts,
      totalStockUnits: inventoryIntelligence.summary.totalStockUnits,
      totalStockValue: inventoryIntelligence.summary.totalStockValue,
      reorderProducts: inventoryIntelligence.summary.reorderProducts,
      outOfStockProducts: inventoryIntelligence.summary.outOfStockProducts,
      deadStockProducts: inventoryIntelligence.summary.deadStockProducts,
      overstockedProducts: inventoryIntelligence.summary.overstockedProducts,
      estimatedReorderValue: inventoryIntelligence.summary.estimatedReorderValue,
      priorityItems: inventoryIntelligence.items
        .filter((item) => item.health === "out_of_stock" || item.health === "critical" || item.health === "reorder" || item.deadStock || item.slowMoving)
        .slice(0, 6)
        .map((item) => ({
          productId: item.productId,
          name: item.name,
          stock: item.stockQuantity,
          unit: products.find((p) => p.id === item.productId)?.unit ?? "",
          health: item.health,
          recommendedOrderQty: item.recommendedOrderQty,
          abcClass: item.abcClass,
          daysOfCover: item.daysOfCover,
        })),
    },
    staffProductivity: {
      totalActiveAssignments: staffProductivity.totalActiveAssignments,
      totalCompletedAssignments: staffProductivity.totalCompletedAssignments,
      overloadedStaff: staffProductivity.overloadedStaff,
      averageCompletionRate: staffProductivity.averageCompletionRate,
      averageOnTimeRate: staffProductivity.averageOnTimeRate,
      staff: staffProductivity.staff.slice(0, 8),
    },
  };
}
