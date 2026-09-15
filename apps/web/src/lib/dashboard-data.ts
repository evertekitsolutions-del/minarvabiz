/**
 * Dashboard data provider — live domain metrics + advanced intelligence.
 */

import {
  shapeDashboardStats,
  collectLiveDashboardMetrics,
  getCustomerIntelligenceSnapshot,
  buildInventoryIntelligence,
  getProductionControlSnapshot,
  calculateStaffProductivity,
  store,
  ordersStore,
  phase6Store,
} from "@minarvabiz/business-logic";
import type { DashboardData } from "@minarvabiz/ui";
import { formatMoney } from "@minarvabiz/utils";

export async function fetchDashboardData(): Promise<DashboardData> {
  const metrics = collectLiveDashboardMetrics();
  const shaped = shapeDashboardStats(metrics);

  const products = store.listProducts();
  const sales = store.listSales();
  const serviceOrders = ordersStore.listOrders();
  const staff = phase6Store.listStaff();
  const assignments = phase6Store.listAssignments();

  const lowStock = products
    .filter((p) => p.stockQuantity <= p.minimumStock)
    .slice(0, 5)
    .map((p) => ({ id: p.id, name: p.name, stock: p.stockQuantity, unit: p.unit }));

  const recentOrders = serviceOrders.slice(0, 6).map((o) => ({
    id: o.id,
    orderNo: o.orderNumber,
    customer: o.customerName || "—",
    type: o.serviceType.replace(/_/g, " "),
    status: (o.status === "ready_to_deliver" ? "ready" : o.status === "cancelled" ? "cancelled" : o.status) as "pending" | "processing" | "ready" | "delivered" | "cancelled",
    dueDate: o.deliveryDate
      ? new Date(o.deliveryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : "—",
  }));

  const byCat = new Map<string, number>();
  for (const s of sales) for (const item of s.items) byCat.set(item.productName, (byCat.get(item.productName) || 0) + item.lineTotal);
  const catEntries = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const catTotal = catEntries.reduce((a, [, v]) => a + v, 0) || 1;
  const colors = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-orange-400", "bg-slate-400"];
  const categories = catEntries.length > 0
    ? catEntries.map(([label, value], i) => ({ id: String(i + 1), label, value: formatMoney(value), percent: Math.round((value / catTotal) * 100), color: colors[i % colors.length] }))
    : [{ id: "1", label: "No sales yet", value: formatMoney(0), percent: 0, color: "bg-slate-300" }];

  const seriesValues = sales.slice(0, 7).reverse().map((s) => s.total);
  while (seriesValues.length < 7) seriesValues.unshift(0);
  const salesSeries = seriesValues.map((value, i) => ({ label: `D${i + 1}`, value }));

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
  const inventory = buildInventoryIntelligence(
    products.map((product) => ({
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
      daysSinceLastSale: lastSale.has(product.id) ? Math.max(0, (now.getTime() - (lastSale.get(product.id) as number)) / 86_400_000) : null,
    })),
    now.toISOString()
  );

  const productionControl = getProductionControlSnapshot(serviceOrders, staff, assignments, now);
  const staffProductivity = calculateStaffProductivity(staff, assignments, now);

  return {
    stats: shaped.stats,
    salesSeries,
    businessSummary: shaped.businessSummary,
    netProfit: shaped.netProfit,
    orderStatus: shaped.orderStatus,
    categories,
    recentOrders: recentOrders.length > 0 ? recentOrders : [{ id: "0", orderNo: "—", customer: "No orders yet", type: "—", status: "pending", dueDate: "—" }],
    lowStock,
    productionControl,
    staffProductivity,
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
      totalProducts: inventory.summary.totalProducts,
      totalStockUnits: inventory.summary.totalStockUnits,
      totalStockValue: inventory.summary.totalStockValue,
      reorderProducts: inventory.summary.reorderProducts,
      outOfStockProducts: inventory.summary.outOfStockProducts,
      deadStockProducts: inventory.summary.deadStockProducts,
      overstockedProducts: inventory.summary.overstockedProducts,
      estimatedReorderValue: inventory.summary.estimatedReorderValue,
      priorityItems: inventory.items
        .filter((item) => item.health === "out_of_stock" || item.health === "critical" || item.health === "reorder" || item.deadStock || item.slowMoving)
        .slice(0, 6)
        .map((item) => {
          const product = products.find((candidate) => candidate.id === item.productId);
          return {
            productId: item.productId,
            name: item.name,
            stock: product?.stockQuantity ?? 0,
            unit: product?.unit ?? "",
            health: item.health,
            recommendedOrderQty: item.recommendedOrderQty,
            abcClass: item.abcClass,
            daysOfCover: item.daysOfCover,
          };
        }),
    },
  };
}
