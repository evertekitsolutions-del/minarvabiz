/**
 * Dashboard data provider.
 * Phase 2: structured sample data matching reference layout.
 * Phase 3+: replace fetchDashboardData() with Supabase / SQLite queries.
 */

import { shapeDashboardStats } from "@minarvabiz/business-logic";
import type { DashboardData } from "@minarvabiz/ui";

export async function fetchDashboardData(): Promise<DashboardData> {
  // TODO: Replace with real repository calls:
  // const sales = await salesRepo.totalsToday();
  // const orders = await ordersRepo.statusCounts();
  // ...

  const shaped = shapeDashboardStats({
    productSalesToday: 145680,
    serviceRevenueToday: 68450,
    laundryRevenueToday: 22560,
    expensesToday: 35240,
    productSalesYesterday: 122800,
    serviceRevenueYesterday: 60900,
    laundryRevenueYesterday: 20750,
    costOfGoodsToday: 42000,
    orderMaterialCostsToday: 18000,
    orderSpecificExpensesToday: 8500,
    generalExpensesToday: 26740,
    staffIncentivesToday: 0,
    pendingOrders: 24,
    processingOrders: 18,
    readyOrders: 12,
    deliveredOrders: 30,
    totalCustomers: 1284,
    lowStockCount: 4,
    outstandingPayments: 48500,
    currency: "INR",
  });

  return {
    stats: shaped.stats,
    salesSeries: [
      { label: "19 May", value: 32000 },
      { label: "20 May", value: 45000 },
      { label: "21 May", value: 38000 },
      { label: "22 May", value: 62000 },
      { label: "23 May", value: 78000 },
      { label: "24 May", value: 65000 },
      { label: "25 May", value: 92000 },
    ],
    businessSummary: shaped.businessSummary,
    netProfit: shaped.netProfit,
    orderStatus: shaped.orderStatus,
    categories: [
      { id: "1", label: "Ornaments", value: "₹ 52,680", percent: 36, color: "bg-violet-500" },
      { id: "2", label: "Readymade Garments", value: "₹ 41,250", percent: 28, color: "bg-blue-500" },
      { id: "3", label: "Materials Sale", value: "₹ 28,300", percent: 19, color: "bg-emerald-500" },
      { id: "4", label: "Ladies Inners", value: "₹ 12,800", percent: 9, color: "bg-orange-400" },
      { id: "5", label: "Other Products", value: "₹ 11,650", percent: 8, color: "bg-slate-400" },
    ],
    recentOrders: [
      { id: "1", orderNo: "ORD-250525-001", customer: "Neha S.", type: "Tailoring", status: "processing", dueDate: "27 May 2025" },
      { id: "2", orderNo: "ORD-250525-002", customer: "Anjali Menon", type: "Wedding Dress", status: "ready", dueDate: "29 May 2025" },
      { id: "3", orderNo: "ORD-250525-003", customer: "Rahul Uniforms", type: "Bulk Order", status: "processing", dueDate: "01 Jun 2025" },
      { id: "4", orderNo: "ORD-250525-004", customer: "Priya R.", type: "Alteration", status: "pending", dueDate: "26 May 2025" },
      { id: "5", orderNo: "ORD-250525-005", customer: "Ayesha K.", type: "Laundry", status: "delivered", dueDate: "25 May 2025" },
    ],
    lowStock: [
      { id: "1", name: "Cotton Thread (White)", stock: 5 },
      { id: "2", name: "Black Lining Fabric", stock: 3 },
      { id: "3", name: "Zipper (Hidden)", stock: 8 },
      { id: "4", name: "Buttons (Mix)", stock: 6 },
    ],
  };
}
