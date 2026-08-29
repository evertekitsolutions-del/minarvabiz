/**
 * Dashboard aggregation helpers.
 * Pure functions — repositories inject raw numbers; this shapes display data.
 * Ready to connect to Supabase / SQLite query results.
 */

import { formatMoney, roundMoney } from "@minarvabiz/utils";
import type { CurrencyCode } from "@minarvabiz/types";

export interface RawDashboardMetrics {
  productSalesToday: number;
  serviceRevenueToday: number;
  laundryRevenueToday: number;
  expensesToday: number;
  productSalesYesterday: number;
  serviceRevenueYesterday: number;
  laundryRevenueYesterday: number;
  /** COGS + order material + order expenses for profit calc */
  costOfGoodsToday: number;
  orderMaterialCostsToday: number;
  orderSpecificExpensesToday: number;
  generalExpensesToday: number;
  staffIncentivesToday: number;
  pendingOrders: number;
  processingOrders: number;
  readyOrders: number;
  deliveredOrders: number;
  totalCustomers: number;
  lowStockCount: number;
  outstandingPayments: number;
  currency?: CurrencyCode;
}

export interface SparkSeries {
  sales: number[];
  services: number[];
  laundry: number[];
  profit: number[];
}

function pctChange(today: number, yesterday: number): { label: string; positive: boolean } {
  if (yesterday === 0) {
    return { label: today > 0 ? "100% vs Yesterday" : "0% vs Yesterday", positive: today >= 0 };
  }
  const pct = roundMoney(((today - yesterday) / yesterday) * 100);
  return {
    label: `${Math.abs(pct)}% vs Yesterday`,
    positive: pct >= 0,
  };
}

/**
 * Shape raw metrics into the DashboardData contract used by the UI.
 * Sales series, categories, orders, low-stock lists come from separate queries.
 */
export function shapeDashboardStats(
  raw: RawDashboardMetrics,
  sparks?: Partial<SparkSeries>
) {
  const currency = raw.currency ?? "INR";
  const money = (n: number) => formatMoney(n, currency);

  const totalSalesToday = raw.productSalesToday;
  const totalServicesToday = raw.serviceRevenueToday;
  const laundryToday = raw.laundryRevenueToday;

  // Proper categorized profit (not naive sales - expenses)
  const totalRevenue =
    raw.productSalesToday + raw.serviceRevenueToday + raw.laundryRevenueToday;
  const totalCogs =
    raw.costOfGoodsToday + raw.orderMaterialCostsToday;
  const grossProfit = roundMoney(totalRevenue - totalCogs);
  const operating =
    raw.orderSpecificExpensesToday +
    raw.generalExpensesToday +
    raw.staffIncentivesToday;
  const netProfit = roundMoney(grossProfit - operating);

  const salesCh = pctChange(raw.productSalesToday, raw.productSalesYesterday);
  const svcCh = pctChange(raw.serviceRevenueToday, raw.serviceRevenueYesterday);
  const laundryCh = pctChange(raw.laundryRevenueToday, raw.laundryRevenueYesterday);
  // Profit change approximated from revenue trend for spark only
  const profitYesterdayApprox =
    raw.productSalesYesterday +
    raw.serviceRevenueYesterday +
    raw.laundryRevenueYesterday;
  const profitCh = pctChange(netProfit, Math.max(profitYesterdayApprox * 0.5, 1));

  return {
    stats: {
      totalSales: {
        value: money(totalSalesToday),
        change: salesCh.label,
        positive: salesCh.positive,
        spark: sparks?.sales ?? [30, 42, 38, 55, 48, 62, 70],
      },
      totalServices: {
        value: money(totalServicesToday),
        change: svcCh.label,
        positive: svcCh.positive,
        spark: sparks?.services ?? [20, 28, 25, 32, 30, 38, 40],
      },
      laundrySales: {
        value: money(laundryToday),
        change: laundryCh.label,
        positive: laundryCh.positive,
        spark: sparks?.laundry ?? [10, 12, 11, 15, 14, 18, 16],
      },
      totalProfit: {
        value: money(netProfit),
        change: profitCh.label,
        positive: profitCh.positive,
        spark: sparks?.profit ?? [15, 22, 18, 28, 25, 35, 40],
      },
      todayExpenses: { value: money(raw.expensesToday), positive: false },
      pendingOrders: { value: String(raw.pendingOrders) },
      readyOrders: { value: String(raw.readyOrders) },
      totalCustomers: { value: String(raw.totalCustomers) },
      lowStockCount: { value: String(raw.lowStockCount) },
      outstandingPayments: { value: money(raw.outstandingPayments) },
    },
    businessSummary: [
      {
        id: "sales",
        label: "Total Sales",
        value: money(totalSalesToday),
      },
      {
        id: "services",
        label: "Total Services",
        value: money(totalServicesToday),
      },
      {
        id: "laundry",
        label: "Laundry & Ironing",
        value: money(laundryToday),
      },
      {
        id: "expenses",
        label: "Total Expenses",
        value: money(raw.expensesToday),
      },
    ],
    netProfit: { label: "Net Profit", value: money(netProfit) },
    orderStatus: [
      { id: "pending", label: "Pending", count: raw.pendingOrders, color: "bg-orange-400" },
      { id: "processing", label: "Processing", count: raw.processingOrders, color: "bg-blue-500" },
      { id: "ready", label: "Ready to Deliver", count: raw.readyOrders, color: "bg-emerald-500" },
      { id: "delivered", label: "Delivered", count: raw.deliveredOrders, color: "bg-violet-500" },
    ],
  };
}
